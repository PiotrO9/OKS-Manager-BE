import { LessonStatus, Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { assertInstructorQualifiedForCourseType } from '../../lib/instructorCourseQualification';
import { getPrisma } from '../../lib/prisma';
import { validateVehicleForInstructor } from '../../lib/vehicle.helpers';
import type { UpdateLessonBody } from '../../schemas/lesson.schemas';
import {
	assertActorCanBookLessonForCourse,
	assertLessonTimeIsBookable,
} from './bookingRules';
import { mapLessonRowToDto, type LessonDto } from './dtoMappers';
import { assertLessonSchedulingWindowAvailable } from './scheduleConflicts';
import { vehicleHasBookingConflict } from './vehicleAvailability';

const prisma = getPrisma();

export { cancelLesson, cancelOwnLesson } from './cancelLessons';

export async function updateLesson(
	actor: { id: string; role: Role },
	lessonId: string,
	body: UpdateLessonBody,
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
			course: {
				select: {
					id: true,
					schoolId: true,
					instructorId: true,
					courseTypeId: true,
					kind: true,
					totalHours: true,
				},
			},
		},
	});

	if (!existing) {
		throw AppError.notFound('Lesson not found');
	}

	await assertActorCanBookLessonForCourse(actor, existing.course.schoolId);

	if (existing.status !== LessonStatus.SCHEDULED) {
		throw AppError.badRequest('Only scheduled lessons can be edited');
	}

	const start =
		body.startTime !== undefined
			? new Date(body.startTime)
			: existing.startTime;
	const end =
		body.endTime !== undefined ? new Date(body.endTime) : existing.endTime;
	const instructorId = body.instructorId ?? existing.instructorId;
	const vehicleId = body.vehicleId ?? existing.vehicleId;

	if (!vehicleId) {
		throw AppError.badRequest('Lesson has no vehicle');
	}

	const timeChanged =
		body.startTime !== undefined || body.endTime !== undefined;
	const instructorChanged =
		body.instructorId !== undefined &&
		body.instructorId !== existing.instructorId;

	const needsInstructorTimeValidation = timeChanged || instructorChanged;

	if (
		instructorId === existing.instructorId &&
		vehicleId === existing.vehicleId &&
		start.getTime() === existing.startTime.getTime() &&
		end.getTime() === existing.endTime.getTime()
	) {
		return {
			lesson: mapLessonRowToDto({
				id: existing.id,
				courseId: existing.courseId,
				studentId: existing.studentId,
				instructorId: existing.instructorId,
				vehicleId: existing.vehicleId,
				lessonType: existing.lessonType,
				startTime: existing.startTime,
				endTime: existing.endTime,
				status: existing.status,
				createdAt: existing.createdAt,
			}),
		};
	}

	const course = existing.course;

	const instructorLink = await prisma.instructorSchool.findFirst({
		where: {
			instructorId,
			schoolId: course.schoolId,
		},
		select: { id: true },
	});

	if (!instructorLink) {
		throw AppError.badRequest(
			'instructor does not belong to this driving school',
		);
	}

	if (course.instructorId != null && course.instructorId !== instructorId) {
		throw AppError.badRequest(
			'instructor does not match course assigned instructor',
		);
	}

	if (instructorChanged) {
		await assertInstructorQualifiedForCourseType(
			instructorId,
			course.courseTypeId,
		);
	}

	if (timeChanged) {
		await assertLessonTimeIsBookable(start, course.schoolId);
	}

	const row = await prisma.$transaction(async (tx) => {
		if (needsInstructorTimeValidation) {
			await assertLessonSchedulingWindowAvailable(tx, {
				instructorId,
				studentProfileId: existing.studentId,
				courseId: course.id,
				courseKind: course.kind,
				totalHours: course.totalHours,
				start,
				end,
				excludeLessonId: lessonId,
			});
		}

		const vehicleInSchool = await tx.vehicle.findFirst({
			where: {
				id: vehicleId,
				schoolId: course.schoolId,
				isActive: true,
			},
			select: { id: true },
		});
		if (!vehicleInSchool) {
			throw AppError.badRequest('Vehicle is not for this driving school');
		}
		await validateVehicleForInstructor(instructorId, vehicleId, tx);

		const vehicleConflict = await vehicleHasBookingConflict(
			tx,
			vehicleId,
			start,
			end,
			{ excludeLessonId: lessonId },
		);
		if (vehicleConflict) {
			throw AppError.conflict('Vehicle is already in use');
		}

		return tx.lesson.update({
			where: { id: lessonId },
			data: {
				instructorId,
				vehicleId,
				startTime: start,
				endTime: end,
			},
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
	});

	return { lesson: mapLessonRowToDto(row) };
}
