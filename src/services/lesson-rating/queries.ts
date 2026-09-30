import { LessonStatus, LessonType, type Prisma } from '@prisma/client';
import { getPrisma } from '../../lib/prisma';
import type {
	InstructorLessonRatingsQuery,
	ListLessonRatingsQuery,
	OwnLessonRatingsQuery,
} from '../../schemas/lesson-rating.schemas';
import {
	assertManagerCanAccessSchool,
	resolveActiveInstructorProfileId,
} from './access';
import { resolveCreatedAtFilter } from './dateFilters';
import { mapRatingListItem } from './mappers';
import type {
	Actor,
	LessonRatingListItemDto,
	LessonRatingsSummaryDto,
} from './types';

const prisma = getPrisma();

function lessonCourseStudentKey(courseId: string, studentId: string): string {
	return `${courseId}:${studentId}`;
}

type LessonProgress = {
	sequenceNumber: number;
	completedMinutesAfterLesson: number;
};

async function resolveLessonProgress(
	rows: Array<{
		lesson: { id: string; courseId: string; studentId: string };
	}>,
): Promise<Map<string, LessonProgress>> {
	if (rows.length === 0) {
		return new Map();
	}

	const uniquePairs = new Map<
		string,
		{ courseId: string; studentId: string }
	>();

	for (const row of rows) {
		const pair = {
			courseId: row.lesson.courseId,
			studentId: row.lesson.studentId,
		};

		uniquePairs.set(
			lessonCourseStudentKey(pair.courseId, pair.studentId),
			pair,
		);
	}

	const completedLessons = await prisma.lesson.findMany({
		where: {
			OR: [...uniquePairs.values()],
			deletedAt: null,
			lessonType: LessonType.PRACTICE,
			status: LessonStatus.COMPLETED,
		},
		select: {
			id: true,
			courseId: true,
			studentId: true,
			startTime: true,
			endTime: true,
		},
		orderBy: [{ startTime: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
	});
	const counters = new Map<string, number>();
	const completedMinutesByCourseStudent = new Map<string, number>();
	const progressByLessonId = new Map<string, LessonProgress>();

	for (const lesson of completedLessons) {
		const key = lessonCourseStudentKey(lesson.courseId, lesson.studentId);
		const sequenceNumber = (counters.get(key) ?? 0) + 1;
		const durationMinutes = Math.max(
			0,
			Math.round(
				(lesson.endTime.getTime() - lesson.startTime.getTime()) /
					60_000,
			),
		);
		const completedMinutesAfterLesson =
			(completedMinutesByCourseStudent.get(key) ?? 0) + durationMinutes;

		counters.set(key, sequenceNumber);
		completedMinutesByCourseStudent.set(key, completedMinutesAfterLesson);
		progressByLessonId.set(lesson.id, {
			sequenceNumber,
			completedMinutesAfterLesson,
		});
	}

	return progressByLessonId;
}

function buildManagerRatingsWhere(
	schoolId: string,
	query: Pick<
		ListLessonRatingsQuery,
		'instructorId' | 'period' | 'dateFrom' | 'dateTo'
	>,
): Prisma.LessonRatingWhereInput {
	const createdAt = resolveCreatedAtFilter(query);

	return {
		...(query.instructorId ? { instructorId: query.instructorId } : {}),
		...(createdAt ? { createdAt } : {}),
		lesson: {
			deletedAt: null,
			lessonType: LessonType.PRACTICE,
			status: LessonStatus.COMPLETED,
			course: {
				schoolId,
				deletedAt: null,
			},
		},
	};
}

async function fetchRatingsWithSummary(
	where: Prisma.LessonRatingWhereInput,
	limit: number,
	options: { includeStudent: boolean; skip?: number },
): Promise<{
	ratings: LessonRatingListItemDto[];
	summary: LessonRatingsSummaryDto;
}> {
	const [rows, aggregate] = await Promise.all([
		prisma.lessonRating.findMany({
			where,
			orderBy: { createdAt: 'desc' },
			...(options.skip !== undefined ? { skip: options.skip } : {}),
			take: limit,
			include: {
				lesson: {
					select: {
						id: true,
						courseId: true,
						studentId: true,
						startTime: true,
						endTime: true,
						course: {
							select: {
								id: true,
								name: true,
								category: true,
								totalHours: true,
								courseType: {
									select: { code: true, name: true },
								},
							},
						},
						vehicle: {
							select: {
								id: true,
								name: true,
								registrationNumber: true,
								brand: true,
								model: true,
							},
						},
					},
				},
				instructor: {
					select: {
						id: true,
						userId: true,
						user: {
							select: {
								firstName: true,
								lastName: true,
								profile: { select: { avatarUrl: true } },
							},
						},
					},
				},
				student: {
					select: {
						id: true,
						userId: true,
						user: {
							select: {
								firstName: true,
								lastName: true,
								profile: { select: { avatarUrl: true } },
							},
						},
					},
				},
			},
		}),
		prisma.lessonRating.aggregate({
			where,
			_count: { _all: true },
			_avg: { rating: true },
		}),
	]);
	const progressByLessonId = await resolveLessonProgress(rows);

	const average = aggregate._avg.rating;

	return {
		ratings: rows.map((row) => {
			const progress = progressByLessonId.get(row.lesson.id);

			return mapRatingListItem(row, {
				includeStudent: options.includeStudent,
				sequenceNumber: progress?.sequenceNumber ?? 1,
				completedMinutesAfterLesson:
					progress?.completedMinutesAfterLesson ??
					Math.max(
						0,
						Math.round(
							(row.lesson.endTime.getTime() -
								row.lesson.startTime.getTime()) /
								60_000,
						),
					),
			});
		}),
		summary: {
			averageRating:
				typeof average === 'number'
					? Math.round(average * 100) / 100
					: null,
			totalCount: aggregate._count._all,
		},
	};
}

export async function listLessonRatingsForManager(
	actor: Actor,
	query: ListLessonRatingsQuery,
): Promise<{
	ratings: LessonRatingListItemDto[];
	summary: LessonRatingsSummaryDto;
	pagination: { page: number; limit: number; totalPages: number };
}> {
	await assertManagerCanAccessSchool(actor, query.schoolId);

	const where = buildManagerRatingsWhere(query.schoolId, query);

	const { ratings, summary } = await fetchRatingsWithSummary(
		where,
		query.limit,
		{
			includeStudent: true,
			skip: (query.page - 1) * query.limit,
		},
	);

	return {
		ratings,
		summary,
		pagination: {
			page: query.page,
			limit: query.limit,
			totalPages: Math.max(
				1,
				Math.ceil(summary.totalCount / query.limit),
			),
		},
	};
}

export async function listInstructorLessonRatingsForManager(
	actor: Actor,
	instructorId: string,
	query: InstructorLessonRatingsQuery,
): Promise<{
	ratings: LessonRatingListItemDto[];
	summary: LessonRatingsSummaryDto;
	pagination: { page: number; limit: number; totalPages: number };
}> {
	await assertManagerCanAccessSchool(actor, query.schoolId);

	const where = buildManagerRatingsWhere(query.schoolId, {
		...query,
		instructorId,
	});

	const { ratings, summary } = await fetchRatingsWithSummary(
		where,
		query.limit,
		{
			includeStudent: true,
			skip: (query.page - 1) * query.limit,
		},
	);

	return {
		ratings,
		summary,
		pagination: {
			page: query.page,
			limit: query.limit,
			totalPages: Math.max(
				1,
				Math.ceil(summary.totalCount / query.limit),
			),
		},
	};
}

export async function listOwnLessonRatingsForInstructor(
	actor: Actor,
	query: OwnLessonRatingsQuery,
): Promise<{
	ratings: LessonRatingListItemDto[];
	summary: LessonRatingsSummaryDto;
	pagination: { page: number; limit: number; totalPages: number };
}> {
	const instructorId = await resolveActiveInstructorProfileId(actor);
	const createdAt = resolveCreatedAtFilter(query);

	const where: Prisma.LessonRatingWhereInput = {
		instructorId,
		...(createdAt ? { createdAt } : {}),
		lesson: {
			deletedAt: null,
			lessonType: LessonType.PRACTICE,
			status: LessonStatus.COMPLETED,
		},
	};

	const { ratings, summary } = await fetchRatingsWithSummary(
		where,
		query.limit,
		{
			includeStudent: false,
			skip: (query.page - 1) * query.limit,
		},
	);

	return {
		ratings,
		summary,
		pagination: {
			page: query.page,
			limit: query.limit,
			totalPages: Math.max(
				1,
				Math.ceil(summary.totalCount / query.limit),
			),
		},
	};
}
