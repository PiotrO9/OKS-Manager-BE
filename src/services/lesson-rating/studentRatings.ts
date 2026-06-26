import { LessonStatus, LessonType, Prisma, Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import type { CreateLessonRatingBody } from '../../schemas/lesson.schemas';
import { mapLessonRatingToDto } from './mappers';
import type { Actor, LessonRatingDto } from './types';

const prisma = getPrisma();

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
