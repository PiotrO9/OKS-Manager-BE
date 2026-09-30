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
	avatarUrl: string | null;
};

export type LessonRatingLessonDto = {
	id: string;
	startTime: string;
	endTime: string;
	sequenceNumber: number;
	completedMinutesAfterLesson: number;
	course: {
		id: string;
		name: string;
		category: string;
		totalHours: number;
		courseType: {
			code: string;
			name: string;
		};
	};
	vehicle: {
		id: string;
		name: string;
		registrationNumber: string;
		brand: string | null;
		model: string | null;
	} | null;
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
				courseId: true;
				studentId: true;
				startTime: true;
				endTime: true;
				course: {
					select: {
						id: true;
						name: true;
						category: true;
						totalHours: true;
						courseType: {
							select: { code: true; name: true };
						};
					};
				};
				vehicle: {
					select: {
						id: true;
						name: true;
						registrationNumber: true;
						brand: true;
						model: true;
					};
				};
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
						profile: { select: { avatarUrl: true } };
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
						profile: { select: { avatarUrl: true } };
					};
				};
			};
		};
	};
}>;
