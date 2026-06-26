import { LessonStatus, LessonType, Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import {
	assertActorCanBookLessonForCourse,
	loadStudentProfileIdForUser,
} from './bookingRules';
import { mapLessonRowToDto, type LessonDto } from './dtoMappers';

const prisma = getPrisma();

export async function cancelLesson(
	actor: { id: string; role: Role },
	lessonId: string,
): Promise<{ lesson: LessonDto }> {
	const existing = await prisma.lesson.findFirst({
		where: { id: lessonId, deletedAt: null },
		select: {
			id: true,
			status: true,
			courseId: true,
			studentId: true,
			instructorId: true,
			vehicleId: true,
			lessonType: true,
			startTime: true,
			endTime: true,
			createdAt: true,
			course: { select: { schoolId: true } },
		},
	});

	if (!existing) {
		throw AppError.notFound('Lesson not found');
	}

	await assertActorCanBookLessonForCourse(actor, existing.course.schoolId);

	if (existing.status === LessonStatus.COMPLETED) {
		throw AppError.badRequest('Cannot cancel a completed lesson');
	}
	if (existing.status === LessonStatus.CANCELLED) {
		throw AppError.badRequest('Lesson is already cancelled');
	}

	const row = await prisma.lesson.update({
		where: { id: lessonId },
		data: { status: LessonStatus.CANCELLED },
		select: {
			id: true,
			courseId: true,
			studentId: true,
			instructorId: true,
			vehicleId: true,
			lessonType: true,
			startTime: true,
			endTime: true,
			status: true,
			createdAt: true,
		},
	});

	return { lesson: mapLessonRowToDto(row) };
}

export async function cancelOwnLesson(
	actor: { id: string; role: Role },
	lessonId: string,
): Promise<{ lesson: LessonDto }> {
	if (actor.role !== Role.STUDENT) {
		throw AppError.forbidden('Forbidden');
	}

	const studentProfileId = await loadStudentProfileIdForUser(actor.id);
	const existing = await prisma.lesson.findFirst({
		where: { id: lessonId, deletedAt: null },
		select: {
			id: true,
			status: true,
			studentId: true,
			lessonType: true,
		},
	});

	if (!existing) {
		throw AppError.notFound('Lesson not found');
	}

	if (existing.studentId !== studentProfileId) {
		throw AppError.forbidden('Forbidden');
	}

	if (existing.lessonType !== LessonType.PRACTICE) {
		throw AppError.badRequest('Only practice lessons can be cancelled');
	}

	if (existing.status === LessonStatus.COMPLETED) {
		throw AppError.badRequest('Cannot cancel a completed lesson');
	}
	if (existing.status === LessonStatus.CANCELLED) {
		throw AppError.badRequest('Lesson is already cancelled');
	}
	if (existing.status !== LessonStatus.SCHEDULED) {
		throw AppError.badRequest('Only scheduled lessons can be cancelled');
	}

	const row = await prisma.lesson.update({
		where: { id: lessonId },
		data: { status: LessonStatus.CANCELLED },
		select: {
			id: true,
			courseId: true,
			studentId: true,
			instructorId: true,
			vehicleId: true,
			lessonType: true,
			startTime: true,
			endTime: true,
			status: true,
			createdAt: true,
		},
	});

	return { lesson: mapLessonRowToDto(row) };
}
