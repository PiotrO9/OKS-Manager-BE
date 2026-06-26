import { LessonStatus, LessonType, type Prisma } from '@prisma/client';
import { getPrisma } from '../../lib/prisma';
import type {
	InstructorLessonRatingsQuery,
	ListLessonRatingsQuery,
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
	options: { includeStudent: boolean },
): Promise<{
	ratings: LessonRatingListItemDto[];
	summary: LessonRatingsSummaryDto;
}> {
	const [rows, aggregate] = await Promise.all([
		prisma.lessonRating.findMany({
			where,
			orderBy: { createdAt: 'desc' },
			take: limit,
			include: {
				lesson: {
					select: {
						id: true,
						startTime: true,
						endTime: true,
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

	const average = aggregate._avg.rating;

	return {
		ratings: rows.map((row) => mapRatingListItem(row, options)),
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
}> {
	await assertManagerCanAccessSchool(actor, query.schoolId);

	const where = buildManagerRatingsWhere(query.schoolId, query);

	return fetchRatingsWithSummary(where, query.limit, {
		includeStudent: true,
	});
}

export async function listInstructorLessonRatingsForManager(
	actor: Actor,
	instructorId: string,
	query: InstructorLessonRatingsQuery,
): Promise<{
	ratings: LessonRatingListItemDto[];
	summary: LessonRatingsSummaryDto;
}> {
	await assertManagerCanAccessSchool(actor, query.schoolId);

	const where = buildManagerRatingsWhere(query.schoolId, {
		...query,
		instructorId,
	});

	return fetchRatingsWithSummary(where, query.limit, {
		includeStudent: true,
	});
}

export async function listOwnLessonRatingsForInstructor(
	actor: Actor,
): Promise<{ ratings: LessonRatingListItemDto[] }> {
	const instructorId = await resolveActiveInstructorProfileId(actor);

	const where: Prisma.LessonRatingWhereInput = {
		instructorId,
		lesson: {
			deletedAt: null,
			lessonType: LessonType.PRACTICE,
			status: LessonStatus.COMPLETED,
		},
	};

	const { ratings } = await fetchRatingsWithSummary(where, 100, {
		includeStudent: false,
	});

	return { ratings };
}
