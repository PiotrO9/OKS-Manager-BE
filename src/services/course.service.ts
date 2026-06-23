import {
	CourseKind,
	LessonStatus,
	LessonType,
	Role,
	type Course,
	type CourseType,
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
	schoolId: string;
	name: string;
	status: CourseParticipantStatus;
	type: CourseKind;
	totalHours: number;
	progress: number;
};

type CurrentUserCourseRow = {
	studentId: string;
	status: CourseParticipantStatus;
		course: {
		id: string;
		schoolId: string;
		name: string;
		kind: CourseKind;
		totalHours: number;
	};
};

type LessonTimeRange = {
	courseId: string;
	startTime: Date;
	endTime: Date;
};

function clampProgress(value: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}

	return Math.max(0, Math.min(100, value));
}

function lessonDurationMinutes(
	row: Pick<LessonTimeRange, 'startTime' | 'endTime'>,
): number {
	return Math.round(
		(row.endTime.getTime() - row.startTime.getTime()) / 60_000,
	);
}

function calculateCourseProgress(
	kind: CourseKind,
	totalHours: number,
	completedMinutes: number,
): number {
	if (kind !== CourseKind.PRACTICAL && kind !== CourseKind.EXTRA) {
		return 0;
	}

	const requiredMinutes = totalHours * 60;
	if (requiredMinutes <= 0 || completedMinutes <= 0) {
		return 0;
	}

	return clampProgress(Math.round((completedMinutes / requiredMinutes) * 100));
}

function groupCompletedMinutesByCourse(
	rows: LessonTimeRange[],
): Map<string, number> {
	const minutesByCourse = new Map<string, number>();

	for (const row of rows) {
		const minutes = lessonDurationMinutes(row);
		if (minutes <= 0) {
			continue;
		}

		minutesByCourse.set(
			row.courseId,
			(minutesByCourse.get(row.courseId) ?? 0) + minutes,
		);
	}

	return minutesByCourse;
}

async function getCompletedDrivingMinutesByCourse(
	rows: CurrentUserCourseRow[],
): Promise<Map<string, number>> {
	const practicalCourseIds = rows
		.filter(
			(row) =>
				row.course.kind === CourseKind.PRACTICAL ||
				row.course.kind === CourseKind.EXTRA,
		)
		.map((row) => row.course.id);

	if (practicalCourseIds.length === 0) {
		return new Map();
	}

	const studentIds = Array.from(new Set(rows.map((row) => row.studentId)));
	const lessons = await prisma.lesson.findMany({
		where: {
			courseId: { in: practicalCourseIds },
			studentId: { in: studentIds },
			status: LessonStatus.COMPLETED,
			lessonType: LessonType.PRACTICE,
			deletedAt: null,
		},
		select: {
			courseId: true,
			startTime: true,
			endTime: true,
		},
	});

	return groupCompletedMinutesByCourse(lessons);
}

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
			studentId: true,
			status: true,
			course: {
				select: {
					id: true,
					schoolId: true,
					name: true,
					kind: true,
					totalHours: true,
				},
			},
		},
	}) as CurrentUserCourseRow[];

	const completedMinutesByCourse =
		await getCompletedDrivingMinutesByCourse(rows);

	return rows.map((row) => ({
		id: row.course.id,
		schoolId: row.course.schoolId,
		name: row.course.name,
		status: row.status,
		type: row.course.kind,
		totalHours: row.course.totalHours,
		progress: calculateCourseProgress(
			row.course.kind,
			row.course.totalHours,
			completedMinutesByCourse.get(row.course.id) ?? 0,
		),
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
