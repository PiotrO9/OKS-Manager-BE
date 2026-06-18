import {
	LessonStatus,
	LessonType,
	Prisma,
	Role,
	type LessonRating,
} from '@prisma/client';
import { AppError } from '../lib/http/AppError';
import { getPrisma } from '../lib/prisma';
import type { CreateLessonRatingBody } from '../schemas/lesson.schemas';
import type {
	InstructorLessonRatingsQuery,
	ListLessonRatingsQuery,
} from '../schemas/lesson-rating.schemas';

const prisma = getPrisma();

type Actor = { id: string; role: Role };

export type LessonRatingDto = {
	id: string;
	lessonId: string;
	instructorId: string;
	rating: number;
	comment: string | null;
	createdAt: string;
};

function mapLessonRatingToDto(row: LessonRating): LessonRatingDto {
	return {
		id: row.id,
		lessonId: row.lessonId,
		instructorId: row.instructorId,
		rating: row.rating,
		comment: row.comment,
		createdAt: row.createdAt.toISOString(),
	};
}

export async function createLessonRating(
	actor: Actor,
	lessonId: string,
	body: CreateLessonRatingBody,
): Promise<{ rating: LessonRatingDto }> {
	if (actor.role !== Role.STUDENT) {
		throw AppError.forbidden('Forbidden');
	}

	const lesson = await prisma.lesson.findFirst({
		where: { id: lessonId, deletedAt: null },
		select: {
			id: true,
			studentId: true,
			instructorId: true,
			lessonType: true,
			status: true,
			studentProfile: {
				select: { userId: true },
			},
			lessonRating: {
				select: { id: true },
			},
		},
	});

	if (!lesson) {
		throw AppError.notFound('Lesson not found');
	}

	if (lesson.studentProfile.userId !== actor.id) {
		throw AppError.forbidden('Forbidden');
	}

	if (lesson.lessonType !== LessonType.PRACTICE) {
		throw AppError.badRequest('Only practice lessons can be rated');
	}

	if (lesson.status !== LessonStatus.COMPLETED) {
		throw AppError.badRequest('Only completed lessons can be rated');
	}

	if (lesson.lessonRating) {
		throw AppError.conflict('Lesson rating already exists');
	}

	try {
		const rating = await prisma.lessonRating.create({
			data: {
				lessonId: lesson.id,
				studentId: lesson.studentId,
				instructorId: lesson.instructorId,
				rating: body.rating,
				comment: body.comment ?? null,
			},
		});

		return { rating: mapLessonRatingToDto(rating) };
	} catch (err) {
		if (
			err instanceof Prisma.PrismaClientKnownRequestError &&
			err.code === 'P2002'
		) {
			throw AppError.conflict('Lesson rating already exists');
		}

		throw err;
	}
}

export async function getLessonRatingForStudent(
	actor: Actor,
	lessonId: string,
): Promise<{ rating: LessonRatingDto | null }> {
	if (actor.role !== Role.STUDENT) {
		throw AppError.forbidden('Forbidden');
	}

	const lesson = await prisma.lesson.findFirst({
		where: { id: lessonId, deletedAt: null },
		select: {
			id: true,
			lessonType: true,
			studentProfile: {
				select: { userId: true },
			},
			lessonRating: true,
		},
	});

	if (!lesson) {
		throw AppError.notFound('Lesson not found');
	}

	if (lesson.studentProfile.userId !== actor.id) {
		throw AppError.forbidden('Forbidden');
	}

	if (lesson.lessonType !== LessonType.PRACTICE) {
		throw AppError.badRequest('Only practice lessons can be rated');
	}

	return {
		rating: lesson.lessonRating
			? mapLessonRatingToDto(lesson.lessonRating)
			: null,
	};
}

export type LessonRatingPersonDto = {
	id: string;
	userId: string;
	firstName: string;
	lastName: string;
};

export type LessonRatingLessonDto = {
	id: string;
	startTime: string;
	endTime: string;
};

export type LessonRatingListItemDto = {
	id: string;
	lessonId: string;
	rating: number;
	comment: string | null;
	createdAt: string;
	lesson: LessonRatingLessonDto;
	instructor: LessonRatingPersonDto;
	student?: LessonRatingPersonDto;
};

export type LessonRatingsSummaryDto = {
	averageRating: number | null;
	totalCount: number;
};

type RatingWithRelations = Prisma.LessonRatingGetPayload<{
	include: {
		lesson: {
			select: {
				id: true;
				startTime: true;
				endTime: true;
			};
		};
		instructor: {
			select: {
				id: true;
				userId: true;
				user: {
					select: {
						firstName: true;
						lastName: true;
					};
				};
			};
		};
		student: {
			select: {
				id: true;
				userId: true;
				user: {
					select: {
						firstName: true;
						lastName: true;
					};
				};
			};
		};
	};
}>;

function mapRatingListItem(
	row: RatingWithRelations,
	options: { includeStudent: boolean },
): LessonRatingListItemDto {
	const item: LessonRatingListItemDto = {
		id: row.id,
		lessonId: row.lessonId,
		rating: row.rating,
		comment: row.comment,
		createdAt: row.createdAt.toISOString(),
		lesson: {
			id: row.lesson.id,
			startTime: row.lesson.startTime.toISOString(),
			endTime: row.lesson.endTime.toISOString(),
		},
		instructor: {
			id: row.instructor.id,
			userId: row.instructor.userId,
			firstName: row.instructor.user.firstName,
			lastName: row.instructor.user.lastName,
		},
	};

	if (options.includeStudent) {
		item.student = {
			id: row.student.id,
			userId: row.student.userId,
			firstName: row.student.user.firstName,
			lastName: row.student.user.lastName,
		};
	}

	return item;
}

function toDayStart(date: Date): Date {
	return new Date(
		Date.UTC(
			date.getUTCFullYear(),
			date.getUTCMonth(),
			date.getUTCDate(),
		),
	);
}

function addDays(date: Date, days: number): Date {
	const out = new Date(date);
	out.setUTCDate(out.getUTCDate() + days);
	return out;
}

function dateOnlyToUtcStart(date: string): Date {
	return new Date(`${date}T00:00:00.000Z`);
}

function resolveCreatedAtFilter(query: {
	period: 'latest' | 'yesterday' | 'last7days' | 'all';
	dateFrom?: string;
	dateTo?: string;
}): Prisma.DateTimeFilter | undefined {
	if (query.dateFrom && query.dateTo) {
		return {
			gte: dateOnlyToUtcStart(query.dateFrom),
			lt: addDays(dateOnlyToUtcStart(query.dateTo), 1),
		};
	}

	const today = toDayStart(new Date());

	if (query.period === 'yesterday') {
		const start = addDays(today, -1);
		return { gte: start, lt: today };
	}

	if (query.period === 'last7days') {
		return { gte: addDays(today, -7), lt: addDays(today, 1) };
	}

	return undefined;
}

async function assertManagerCanAccessSchool(
	actor: Actor,
	schoolId: string,
): Promise<void> {
	if (actor.role !== Role.ADMIN && actor.role !== Role.MANAGER) {
		throw AppError.forbidden('Forbidden');
	}

	const school = await prisma.drivingSchool.findUnique({
		where: { id: schoolId },
		select: { id: true, ownerId: true, deletedAt: true },
	});

	if (!school || school.deletedAt !== null) {
		throw AppError.badRequest('Invalid schoolId');
	}

	if (actor.role === Role.MANAGER && school.ownerId !== actor.id) {
		throw AppError.forbidden('Forbidden');
	}
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
	if (actor.role !== Role.INSTRUCTOR) {
		throw AppError.forbidden('Forbidden');
	}

	const profile = await prisma.instructorProfile.findFirst({
		where: {
			userId: actor.id,
			user: {
				role: Role.INSTRUCTOR,
				deletedAt: null,
				isActive: true,
			},
		},
		select: { id: true },
	});

	if (!profile) {
		throw AppError.notFound('Instructor profile not found');
	}

	const where: Prisma.LessonRatingWhereInput = {
		instructorId: profile.id,
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
