import {
	Role,
	type Course,
	type CourseType,
	type CourseKind,
	type CourseParticipantStatus,
	type DrivingSchool,
} from '@prisma/client';
import { AppError } from '../lib/http/AppError';
import { assertInstructorQualifiedForCourseType } from '../lib/instructorCourseQualification';
import { getPrisma } from '../lib/prisma';
import type {
	CreateCourseBody,
	PatchCourseBody,
} from '../schemas/course.schemas';

const prisma = getPrisma();

async function getSchoolOwnedByUser(
	userId: string,
	schoolId: string,
): Promise<DrivingSchool | null> {
	const school = await prisma.drivingSchool.findUnique({
		where: { id: schoolId },
	});
	if (!school || school.deletedAt !== null || school.ownerId !== userId) {
		return null;
	}
	return school;
}

export type CreatedCourseDto = {
	id: string;
	name: string;
	category: string;
	courseType: CourseTypeDto;
	kind: CourseKind;
	totalHours: number;
	capacity: number | null;
	theoryStartDate: Date | null;
	theoryEndDate: Date | null;
	schoolId: string;
	instructorId: string | null;
	status: string;
	createdAt: Date;
};

export type CourseTypeDto = {
	id: string;
	code: string;
	name: string;
};

type CourseWithType = Course & {
	courseType: Pick<CourseType, 'id' | 'code' | 'name'>;
};

function toCourseTypeDto(
	row: Pick<CourseType, 'id' | 'code' | 'name'>,
): CourseTypeDto {
	return {
		id: row.id,
		code: row.code,
		name: row.name,
	};
}

function toDto(row: CourseWithType): CreatedCourseDto {
	return {
		id: row.id,
		name: row.name,
		category: row.category,
		courseType: toCourseTypeDto(row.courseType),
		kind: row.kind,
		totalHours: row.totalHours,
		capacity: row.capacity,
		theoryStartDate: row.theoryStartDate,
		theoryEndDate: row.theoryEndDate,
		schoolId: row.schoolId,
		instructorId: row.instructorId,
		status: row.status,
		createdAt: row.createdAt,
	};
}

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

async function createCourseForUser(
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
		body.kind === 'THEORY_GROUP' ? (body.capacity ?? null) : null;

	const theoryDates =
		body.kind === 'THEORY_GROUP' &&
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

export type CourseListInstructorDto = {
	id: string;
	name: string;
};

export type CourseListItemDto = {
	id: string;
	name: string;
	category: string;
	courseType: CourseTypeDto;
	type: CourseKind;
	totalHours: number;
	instructor: CourseListInstructorDto | null;
};

export type CurrentUserCourseDto = {
	id: string;
	name: string;
	status: CourseParticipantStatus;
};

async function listCoursesForSchool(
	userId: string,
	schoolId: string,
): Promise<CourseListItemDto[]> {
	const schoolRow = await getSchoolOwnedByUser(userId, schoolId);
	if (!schoolRow) {
		throw AppError.forbidden('Forbidden');
	}

	const rows = await prisma.course.findMany({
		where: {
			schoolId: schoolRow.id,
			deletedAt: null,
		},
		orderBy: { createdAt: 'desc' },
		include: {
			courseType: {
				select: { id: true, code: true, name: true },
			},
			instructor: {
				include: {
					user: {
						select: {
							id: true,
							firstName: true,
							lastName: true,
						},
					},
				},
			},
		},
	});

	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		category: row.category,
		courseType: toCourseTypeDto(row.courseType),
		type: row.kind,
		totalHours: row.totalHours,
		instructor: row.instructor
			? {
					id: row.instructor.user.id,
					name: `${row.instructor.user.firstName} ${row.instructor.user.lastName}`.trim(),
				}
			: null,
	}));
}

async function listCoursesForCurrentUser(
	userId: string,
	role: Role,
): Promise<CurrentUserCourseDto[]> {
	if (role !== Role.STUDENT) {
		return [];
	}

	const rows = await prisma.courseParticipant.findMany({
		where: {
			student: { userId },
			course: { deletedAt: null },
		},
		orderBy: { createdAt: 'asc' },
		select: {
			status: true,
			course: {
				select: {
					id: true,
					name: true,
				},
			},
		},
	});

	return rows.map((row) => ({
		id: row.course.id,
		name: row.course.name,
		status: row.status,
	}));
}

export type CourseDetailDto = {
	id: string;
	schoolId: string;
	name: string;
	category: string;
	courseType: CourseTypeDto;
	type: CourseKind;
	totalHours: number;
	capacity: number | null;
	instructor: CourseListInstructorDto | null;
};

async function getCourseDetailForOwner(
	userId: string,
	courseId: string,
): Promise<CourseDetailDto> {
	const row = await prisma.course.findUnique({
		where: { id: courseId },
		include: {
			courseType: {
				select: { id: true, code: true, name: true },
			},
			instructor: {
				include: {
					user: {
						select: {
							id: true,
							firstName: true,
							lastName: true,
						},
					},
				},
			},
			school: { select: { ownerId: true } },
		},
	});

	if (!row || row.deletedAt !== null) {
		throw AppError.notFound('Course not found');
	}
	if (row.school.ownerId !== userId) {
		throw AppError.forbidden('Forbidden');
	}

	return {
		id: row.id,
		schoolId: row.schoolId,
		name: row.name,
		category: row.category,
		courseType: toCourseTypeDto(row.courseType),
		type: row.kind,
		totalHours: row.totalHours,
		capacity: row.capacity,
		instructor: row.instructor
			? {
					id: row.instructor.user.id,
					name: `${row.instructor.user.firstName} ${row.instructor.user.lastName}`.trim(),
				}
			: null,
	};
}

async function patchCourseInstructorForOwner(
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
		(row.kind === 'THEORY_GROUP' || body.capacity === null)
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

export const courseService = {
	createCourseForUser,
	listCoursesForSchool,
	listCoursesForCurrentUser,
	getCourseDetailForOwner,
	patchCourseInstructorForOwner,
};
