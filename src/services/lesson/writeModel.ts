import {
	CourseKind,
	CourseParticipantStatus,
	EventType,
	LessonStatus,
	LessonType,
	Prisma,
	Role,
	VehicleAvailabilityStatus,
} from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { assertInstructorQualifiedForCourseType } from '../../lib/instructorCourseQualification';
import { validateVehicleForInstructor } from '../../lib/vehicle.helpers';
import { getPrisma } from '../../lib/prisma';
import type {
	BookLessonBody,
	BookOwnLessonBody,
	UpdateLessonBody,
} from '../../schemas/lesson.schemas';
import {
	assertCourseDrivingPackageHoursAllowNewLesson,
	assertStudentNoScheduleOverlap,
} from '../../lib/lesson-scheduling';
import { assertInstructorTimeWindowAvailable } from '../instructor-availability.service';

const prisma = getPrisma();

import {
	addDaysYyyymmdd,
	compareYyyymmdd,
	formatYYYYMMDD,
	utcTodayYyyymmdd,
} from './dateUtils';
import { mapLessonRowToDto, type LessonDto } from './dtoMappers';
import {
	assertActorCanBookLessonForCourse,
	loadStudentProfileIdForUser,
} from './bookingRules';

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
		if (start.getTime() < Date.now()) {
			throw AppError.badRequest('Lesson time must be in the future');
		}

		const settings = await prisma.schoolSettings.findUnique({
			where: { schoolId: course.schoolId },
			select: { bookingMaxDaysAhead: true },
		});
		const bookingMaxDaysAhead = settings?.bookingMaxDaysAhead ?? 30;
		const lessonDay = formatYYYYMMDD(start);
		const today = utcTodayYyyymmdd();
		const maxBookable = addDaysYyyymmdd(today, bookingMaxDaysAhead);
		if (compareYyyymmdd(lessonDay, today) < 0) {
			throw AppError.badRequest('Lesson date cannot be in the past');
		}
		if (compareYyyymmdd(lessonDay, maxBookable) > 0) {
			throw AppError.badRequest('Lesson date is outside booking window');
		}
	}

	const row = await prisma.$transaction(async (tx) => {
		if (needsInstructorTimeValidation) {
			await assertInstructorTimeWindowAvailable(
				instructorId,
				start,
				end,
				tx,
				undefined,
				lessonId,
			);

			await assertStudentNoScheduleOverlap(
				tx,
				existing.studentId,
				start,
				end,
				{
					excludeLessonId: lessonId,
				},
			);

			await assertCourseDrivingPackageHoursAllowNewLesson(
				tx,
				course.id,
				existing.studentId,
				course.kind,
				course.totalHours,
				start,
				end,
				lessonId,
			);

			const lessonConflict = await tx.lesson.findFirst({
				where: {
					instructorId,
					status: { not: LessonStatus.CANCELLED },
					startTime: { lt: end },
					endTime: { gt: start },
					id: { not: lessonId },
				},
				select: { id: true },
			});
			if (lessonConflict) {
				throw AppError.conflict('Time slot conflicts with a lesson');
			}

			const eventConflict = await tx.instructorEvent.findFirst({
				where: {
					instructorId,
					isActive: true,
					startTime: { lt: end },
					endTime: { gt: start },
				},
				select: { id: true },
			});
			if (eventConflict) {
				throw AppError.conflict(
					'Time slot conflicts with a scheduled block',
				);
			}
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

		const vehicleLessonConflict = await tx.lesson.findFirst({
			where: {
				vehicleId,
				status: { not: LessonStatus.CANCELLED },
				startTime: { lt: end },
				endTime: { gt: start },
				id: { not: lessonId },
			},
			select: { id: true },
		});
		if (vehicleLessonConflict) {
			throw AppError.conflict('Vehicle is already in use');
		}

		const vehicleEventConflict = await tx.instructorEvent.findFirst({
			where: {
				vehicleId,
				type: EventType.DRIVE,
				isActive: true,
				startTime: { lt: end },
				endTime: { gt: start },
			},
			select: { id: true },
		});
		if (vehicleEventConflict) {
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
