import { runScheduleWriteTransaction } from '../schedule-validation/transaction';
import { CourseKind, type Prisma } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { assertInstructorQualifiedForCourseType } from '../../lib/instructorCourseQualification';
import { getPrisma } from '../../lib/prisma';
import type {
	CreateCourseBody,
	PatchCourseBody,
} from '../../schemas/course.schemas';
import { getSchoolOwnedByUser } from './access';
import { toCourseTypeDto, toDto } from './mappers';
import { getCourseDetailForOwner } from './queries';
import type { CourseDetailDto, CourseTypeDto, CreatedCourseDto } from './types';

const prisma = getPrisma();

async function resolveCourseTypeByCategory(
	category: string,
	db: Prisma.TransactionClient = prisma,
): Promise<CourseTypeDto> {
	const code = category.trim();
	const courseType = await db.courseType.findUnique({
		where: { code },
		select: { id: true, code: true, name: true },
	});

	if (!courseType) {
		throw AppError.badRequest('Invalid course category');
	}

	return toCourseTypeDto(courseType);
}

export async function createCourseForUser(
	userId: string,
	body: CreateCourseBody,
): Promise<CreatedCourseDto> {
	const schoolRow = await getSchoolOwnedByUser(userId, body.schoolId);
	if (!schoolRow) {
		throw AppError.forbidden('Forbidden');
	}

	if (body.instructorId) {
		const link = await prisma.instructorSchool.findFirst({
			where: {
				instructorId: body.instructorId,
				schoolId: body.schoolId,
			},
		});
		if (!link) {
			throw AppError.badRequest(
				'instructor does not belong to this school',
			);
		}
	}

	const schoolSettings = await prisma.schoolSettings.findUnique({
		where: { schoolId: body.schoolId },
	});
	if (!schoolSettings) {
		throw AppError.badRequest('School settings not configured');
	}
	if (schoolSettings.enabledCourseKinds.length === 0) {
		throw AppError.badRequest('No course kinds enabled for this school');
	}
	if (!schoolSettings.enabledCourseKinds.includes(body.kind)) {
		throw AppError.badRequest('Course kind is not enabled for this school');
	}

	const courseType = await resolveCourseTypeByCategory(body.category);

	if (body.instructorId) {
		await assertInstructorQualifiedForCourseType(
			body.instructorId,
			courseType.id,
		);
	}

	const capacity =
		body.kind === CourseKind.THEORY_GROUP ? (body.capacity ?? null) : null;

	const theoryDates =
		body.kind === CourseKind.THEORY_GROUP &&
		body.theoryStartDate &&
		body.theoryEndDate
			? {
					theoryStartDate: body.theoryStartDate,
					theoryEndDate: body.theoryEndDate,
				}
			: { theoryStartDate: null, theoryEndDate: null };

	const created = await prisma.course.create({
		data: {
			schoolId: body.schoolId,
			name: body.name,
			category: courseType.code,
			courseTypeId: courseType.id,
			kind: body.kind,
			totalHours: body.totalHours,
			capacity,
			...theoryDates,
			instructorId: body.instructorId ?? null,
		},
		include: {
			courseType: { select: { id: true, code: true, name: true } },
		},
	});

	return toDto(created);
}

export async function patchCourseForOwner(
	userId: string,
	courseId: string,
	body: PatchCourseBody,
): Promise<CourseDetailDto> {
	if (Object.keys(body).length === 0)
		return getCourseDetailForOwner(userId, courseId);
	await runScheduleWriteTransaction(async (tx) => {
		const row = await tx.course.findUnique({
			where: { id: courseId },
			include: {
				school: { select: { ownerId: true } },
			},
		});

		if (!row || row.deletedAt !== null) {
			throw AppError.notFound('Course not found');
		}
		if (row.school.ownerId !== userId) {
			throw AppError.forbidden('Forbidden');
		}

		const nextKind = body.kind ?? row.kind;
		const nextCategory = body.category ?? row.category;
		const nextStart =
			body.theoryStartDate === undefined
				? row.theoryStartDate
				: body.theoryStartDate;
		const nextEnd =
			body.theoryEndDate === undefined
				? row.theoryEndDate
				: body.theoryEndDate;
		const nextCapacity =
			body.capacity === undefined ? row.capacity : body.capacity;
		if (nextKind === CourseKind.THEORY_GROUP) {
			if (
				(body.kind !== undefined ||
					body.theoryStartDate !== undefined ||
					body.theoryEndDate !== undefined) &&
				(!nextStart || !nextEnd || nextEnd < nextStart)
			) {
				throw AppError.badRequest(
					'Valid theory dates are required for THEORY_GROUP',
				);
			}
		} else if (nextCapacity != null && body.capacity !== undefined) {
			throw AppError.badRequest(
				'capacity is only allowed for THEORY_GROUP courses',
			);
		}

		const structuralChange =
			nextKind !== row.kind ||
			nextCategory !== row.category ||
			(body.totalHours !== undefined &&
				body.totalHours !== row.totalHours) ||
			(body.theoryStartDate !== undefined &&
				nextStart?.getTime() !== row.theoryStartDate?.getTime()) ||
			(body.theoryEndDate !== undefined &&
				nextEnd?.getTime() !== row.theoryEndDate?.getTime());
		if (structuralChange) {
			const [participants, lessons, events] = await Promise.all([
				tx.courseParticipant.count({ where: { courseId } }),
				tx.lesson.count({ where: { courseId, deletedAt: null } }),
				tx.instructorEvent.count({ where: { courseId } }),
			]);
			if (participants || lessons || events) {
				throw AppError.conflict(
					'Nie można zmienić kategorii, rodzaju, godzin ani terminów kursu, który ma zapisy lub zajęcia.',
				);
			}
		}

		if (
			nextKind === CourseKind.THEORY_GROUP &&
			nextCapacity != null &&
			body.capacity !== undefined
		) {
			const activeParticipants = await tx.courseParticipant.count({
				where: { courseId, status: 'ACTIVE' },
			});
			if (nextCapacity < activeParticipants) {
				throw AppError.conflict(
					'Limit miejsc nie może być mniejszy od liczby aktywnych zapisów.',
				);
			}
		}

		let courseTypeId = row.courseTypeId;
		if (body.category !== undefined && body.category !== row.category) {
			const courseType = await resolveCourseTypeByCategory(
				body.category,
				tx,
			);
			courseTypeId = courseType.id;
		}
		if (body.kind !== undefined && body.kind !== row.kind) {
			const settings = await tx.schoolSettings.findUnique({
				where: { schoolId: row.schoolId },
			});
			if (!settings?.enabledCourseKinds.includes(body.kind)) {
				throw AppError.badRequest(
					'Course kind is not enabled for this school',
				);
			}
		}

		const data: {
			name?: string;
			category?: string;
			courseTypeId?: string;
			kind?: CourseKind;
			totalHours?: number;
			theoryStartDate?: Date | null;
			theoryEndDate?: Date | null;
			instructorId?: string | null;
			capacity?: number | null;
		} = {};
		if (body.name !== undefined) data.name = body.name;
		if (body.category !== undefined) {
			data.category = body.category;
			data.courseTypeId = courseTypeId;
		}
		if (body.kind !== undefined) data.kind = body.kind;
		if (body.totalHours !== undefined) data.totalHours = body.totalHours;
		if (body.kind !== undefined && nextKind !== CourseKind.THEORY_GROUP) {
			data.theoryStartDate = null;
			data.theoryEndDate = null;
			data.capacity = null;
		} else {
			if (body.theoryStartDate !== undefined)
				data.theoryStartDate = body.theoryStartDate;
			if (body.theoryEndDate !== undefined)
				data.theoryEndDate = body.theoryEndDate;
			if (body.capacity !== undefined) data.capacity = body.capacity;
		}

		if ('instructorId' in body) {
			const nextInstructorId = body.instructorId;
			if (nextInstructorId != null) {
				const link = await tx.instructorSchool.findFirst({
					where: {
						instructorId: nextInstructorId,
						schoolId: row.schoolId,
					},
				});
				if (!link) {
					throw AppError.badRequest(
						'instructor does not belong to this school',
					);
				}
				await assertInstructorQualifiedForCourseType(
					nextInstructorId,
					courseTypeId,
					tx,
				);
			}
			data.instructorId = nextInstructorId ?? null;
		} else if (courseTypeId !== row.courseTypeId && row.instructorId) {
			await assertInstructorQualifiedForCourseType(
				row.instructorId,
				courseTypeId,
				tx,
			);
		}

		if (Object.keys(data).length === 0) {
			return;
		}

		await tx.course.update({
			where: { id: courseId },
			data,
		});
	});
	return getCourseDetailForOwner(userId, courseId);
}

export async function deleteEmptyCourseForOwner(
	userId: string,
	courseId: string,
): Promise<void> {
	await prisma.$transaction(async (tx) => {
		// Serialize deletion with inserts into tables referencing this course.
		const rows = await tx.$queryRaw<
			Array<{
				id: string;
				school_id: string;
				deleted_at: Date | null;
			}>
		>`SELECT id, school_id, deleted_at FROM courses WHERE id = ${courseId}::uuid FOR UPDATE`;
		const course = rows[0];
		if (!course || course.deleted_at) {
			throw AppError.notFound('Course not found');
		}
		const school = await tx.drivingSchool.findUnique({
			where: { id: course.school_id },
			select: { ownerId: true, deletedAt: true },
		});
		if (!school || school.deletedAt || school.ownerId !== userId) {
			throw AppError.forbidden('Forbidden');
		}

		const [participants, lessons, events, paymentPlans] = await Promise.all(
			[
				tx.courseParticipant.count({ where: { courseId } }),
				tx.lesson.count({ where: { courseId } }),
				tx.instructorEvent.count({ where: { courseId } }),
				tx.paymentPlan.count({ where: { courseId } }),
			],
		);
		if (participants)
			throw AppError.conflict(
				'Nie można usunąć kursu, ponieważ ma zapisanych kursantów.',
			);
		if (lessons)
			throw AppError.conflict(
				'Nie można usunąć kursu, ponieważ ma zajęcia.',
			);
		if (events)
			throw AppError.conflict(
				'Nie można usunąć kursu, ponieważ ma wydarzenia.',
			);
		if (paymentPlans)
			throw AppError.conflict(
				'Nie można usunąć kursu, ponieważ ma plany płatności.',
			);
		await tx.course.update({
			where: { id: courseId },
			data: { deletedAt: new Date() },
		});
	});
}
