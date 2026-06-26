import { CourseKind } from '@prisma/client';
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
import type {
	CourseDetailDto,
	CourseTypeDto,
	CreatedCourseDto,
} from './types';

const prisma = getPrisma();

async function resolveCourseTypeByCategory(
	category: string,
): Promise<CourseTypeDto> {
	const code = category.trim();
	const courseType = await prisma.courseType.findUnique({
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

export async function patchCourseInstructorForOwner(
	userId: string,
	courseId: string,
	body: PatchCourseBody,
): Promise<CourseDetailDto> {
	const hasInstructorKey = Object.prototype.hasOwnProperty.call(
		body,
		'instructorId',
	);
	const hasCapacityKey = Object.prototype.hasOwnProperty.call(
		body,
		'capacity',
	);
	if (!hasInstructorKey && !hasCapacityKey) {
		return getCourseDetailForOwner(userId, courseId);
	}

	const row = await prisma.course.findUnique({
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

	if (
		hasCapacityKey &&
		body.capacity != null &&
		row.kind !== 'THEORY_GROUP'
	) {
		throw AppError.badRequest(
			'capacity is only allowed for THEORY_GROUP courses',
		);
	}

	const data: {
		instructorId?: string | null;
		capacity?: number | null;
	} = {};

	if (hasInstructorKey) {
		const nextInstructorId = body.instructorId;
		if (nextInstructorId != null) {
			const link = await prisma.instructorSchool.findFirst({
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
				row.courseTypeId,
			);
		}
		data.instructorId = nextInstructorId ?? null;
	}

	if (
		hasCapacityKey &&
		(row.kind === CourseKind.THEORY_GROUP || body.capacity === null)
	) {
		data.capacity = body.capacity ?? null;
	}

	if (Object.keys(data).length === 0) {
		return getCourseDetailForOwner(userId, courseId);
	}

	await prisma.course.update({
		where: { id: courseId },
		data,
	});

	return getCourseDetailForOwner(userId, courseId);
}
