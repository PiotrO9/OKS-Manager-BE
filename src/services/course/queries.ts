import { CourseKind, LessonStatus, LessonType, Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import { getSchoolOwnedByUser } from './access';
import { toCourseTypeDto } from './mappers';
import {
	calculateCourseProgress,
	groupCompletedMinutesByCourse,
} from './progress';
import type {
	CourseDetailDto,
	CourseListItemDto,
	CurrentUserCourseDto,
	CurrentUserCourseRow,
} from './types';

const prisma = getPrisma();

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

export async function listCoursesForSchool(
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

export async function listCoursesForCurrentUser(
	userId: string,
	role: Role,
): Promise<CurrentUserCourseDto[]> {
	if (role !== Role.STUDENT) {
		return [];
	}

	const rows = (await prisma.courseParticipant.findMany({
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
	})) as CurrentUserCourseRow[];

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

export async function getCourseDetailForOwner(
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
