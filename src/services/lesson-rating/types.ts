import type { Prisma, Role } from '@prisma/client';

export type Actor = { id: string; role: Role };

export type LessonRatingDto = {
	id: string;
	lessonId: string;
	instructorId: string;
	rating: number;
	comment: string | null;
	createdAt: string;
};

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

export type RatingWithRelations = Prisma.LessonRatingGetPayload<{
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
