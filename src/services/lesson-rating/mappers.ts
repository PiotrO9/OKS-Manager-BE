import type { LessonRating } from '@prisma/client';
import type {
	LessonRatingDto,
	LessonRatingListItemDto,
	RatingWithRelations,
} from './types';

export function mapLessonRatingToDto(
	row: LessonRating,
): LessonRatingDto {
	return {
		id: row.id,
		lessonId: row.lessonId,
		instructorId: row.instructorId,
		rating: row.rating,
		comment: row.comment,
		createdAt: row.createdAt.toISOString(),
	};
}

export function mapRatingListItem(
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
