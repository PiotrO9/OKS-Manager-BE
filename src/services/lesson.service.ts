import { EventType, LessonStatus, LessonType, Role } from '@prisma/client';
import { AppError } from '../lib/http/AppError';
import { validateVehicleForInstructor } from '../lib/vehicle.helpers';
import { getPrisma } from '../lib/prisma';
import type { BookLessonBody } from '../schemas/lesson.schemas';
import {
	assertCourseDrivingPackageHoursAllowNewLesson,
	assertStudentNoScheduleOverlap,
} from '../lib/lesson-scheduling';
import { assertInstructorTimeWindowAvailable } from './instructor-availability.service';

const prisma = getPrisma();

function formatYYYYMMDD(date: Date): string {
	const y = date.getUTCFullYear();
	const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
	const d = String(date.getUTCDate()).padStart(2, '0');
	return `${y}-${mo}-${d}`;
}

function yyyymmddToDate(dateStr: string): Date {
	const [y, mo, d] = dateStr.split('-').map(Number);
	return new Date(Date.UTC(y ?? 0, (mo ?? 1) - 1, d ?? 1));
}

function addDaysYyyymmdd(dateStr: string, days: number): string {
	const d = yyyymmddToDate(dateStr);
	d.setUTCDate(d.getUTCDate() + days);
	return formatYYYYMMDD(d);
}

function compareYyyymmdd(a: string, b: string): number {
	if (a < b) {
		return -1;
	}
	if (a > b) {
		return 1;
	}
	return 0;
}

function utcTodayYyyymmdd(): string {
	return formatYYYYMMDD(new Date());
}

export type LessonDto = {
	id: string;
	courseId: string;
	studentId: string;
	instructorId: string;
	vehicleId: string | null;
	lessonType: LessonType;
	startTime: string;
	endTime: string;
	status: string;
	createdAt: string;
};

async function assertActorCanBookLessonForCourse(
	actor: { id: string; role: Role },
	schoolId: string,
): Promise<void> {
	if (actor.role === Role.ADMIN) {
		return;
	}
	if (actor.role === Role.MANAGER) {
		const school = await prisma.drivingSchool.findFirst({
			where: { id: schoolId, ownerId: actor.id, deletedAt: null },
			select: { id: true },
		});
		if (!school) {
			throw AppError.forbidden('Forbidden');
		}
		return;
	}
	throw AppError.forbidden('Forbidden');
}

export async function bookLesson(
	actor: { id: string; role: Role },
	body: BookLessonBody,
): Promise<{ lesson: LessonDto }> {
	const start = new Date(body.startTime);
	const end = new Date(body.endTime);

	if (start.getTime() < Date.now()) {
		throw AppError.badRequest('Lesson time must be in the future');
	}

	const course = await prisma.course.findFirst({
		where: { id: body.courseId, deletedAt: null },
		select: {
			id: true,
			schoolId: true,
			instructorId: true,
			kind: true,
			totalHours: true,
		},
	});

	if (!course) {
		throw AppError.notFound('Course not found');
	}

	await assertActorCanBookLessonForCourse(actor, course.schoolId);

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

	const studentUser = await prisma.user.findUnique({
		where: { id: body.studentId },
		select: {
			id: true,
			role: true,
			deletedAt: true,
			isActive: true,
			studentProfile: { select: { id: true } },
		},
	});

	if (!studentUser || studentUser.deletedAt !== null) {
		throw AppError.notFound('User not found');
	}

	if (!studentUser.isActive) {
		throw AppError.forbidden('Account is disabled');
	}

	if (studentUser.role !== Role.STUDENT || !studentUser.studentProfile) {
		throw AppError.badRequest('studentId must be a student user');
	}

	const studentProfileId = studentUser.studentProfile.id;

	const participant = await prisma.courseParticipant.findFirst({
		where: {
			courseId: course.id,
			studentId: studentProfileId,
		},
		select: { id: true },
	});

	if (!participant) {
		throw AppError.notFound('Student is not enrolled in this course');
	}

	const instructorLink = await prisma.instructorSchool.findFirst({
		where: {
			instructorId: body.instructorId,
			schoolId: course.schoolId,
		},
		select: { id: true },
	});

	if (!instructorLink) {
		throw AppError.badRequest(
			'instructor does not belong to this driving school',
		);
	}

	if (
		course.instructorId != null &&
		course.instructorId !== body.instructorId
	) {
		throw AppError.badRequest(
			'instructor does not match course assigned instructor',
		);
	}

	const row = await prisma.$transaction(async (tx) => {
		await assertInstructorTimeWindowAvailable(
			body.instructorId,
			start,
			end,
			tx,
		);

		await assertStudentNoScheduleOverlap(tx, studentProfileId, start, end);
		await assertCourseDrivingPackageHoursAllowNewLesson(
			tx,
			course.id,
			studentProfileId,
			course.kind,
			course.totalHours,
			start,
			end,
		);

		const lessonConflict = await tx.lesson.findFirst({
			where: {
				instructorId: body.instructorId,
				status: { not: LessonStatus.CANCELLED },
				startTime: { lt: end },
				endTime: { gt: start },
			},
			select: { id: true },
		});
		if (lessonConflict) {
			throw AppError.conflict('Time slot conflicts with a lesson');
		}

		const eventConflict = await tx.instructorEvent.findFirst({
			where: {
				instructorId: body.instructorId,
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

		const vehicleId = body.vehicleId;
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
		await validateVehicleForInstructor(body.instructorId, vehicleId, tx);

		const vehicleLessonConflict = await tx.lesson.findFirst({
			where: {
				vehicleId,
				status: { not: LessonStatus.CANCELLED },
				startTime: { lt: end },
				endTime: { gt: start },
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
				startTime: { lt: end },
				endTime: { gt: start },
			},
			select: { id: true },
		});
		if (vehicleEventConflict) {
			throw AppError.conflict('Vehicle is already in use');
		}

		return tx.lesson.create({
			data: {
				courseId: course.id,
				studentId: studentProfileId,
				instructorId: body.instructorId,
				vehicleId,
				lessonType: LessonType.PRACTICE,
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

	return {
		lesson: {
			id: row.id,
			courseId: row.courseId,
			studentId: row.studentId,
			instructorId: row.instructorId,
			vehicleId: row.vehicleId,
			lessonType: row.lessonType,
			startTime: row.startTime.toISOString(),
			endTime: row.endTime.toISOString(),
			status: row.status,
			createdAt: row.createdAt.toISOString(),
		},
	};
}

function mapLessonRowToDto(row: {
	id: string;
	courseId: string;
	studentId: string;
	instructorId: string;
	vehicleId: string | null;
	lessonType: LessonType;
	startTime: Date;
	endTime: Date;
	status: LessonStatus;
	createdAt: Date;
}): LessonDto {
	return {
		id: row.id,
		courseId: row.courseId,
		studentId: row.studentId,
		instructorId: row.instructorId,
		vehicleId: row.vehicleId,
		lessonType: row.lessonType,
		startTime: row.startTime.toISOString(),
		endTime: row.endTime.toISOString(),
		status: row.status,
		createdAt: row.createdAt.toISOString(),
	};
}

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
