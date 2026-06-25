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

type DbClient = Prisma.TransactionClient | typeof prisma;

export async function vehicleHasBookingConflict(
	db: DbClient,
	vehicleId: string,
	start: Date,
	end: Date,
	options?: { excludeLessonId?: string },
): Promise<boolean> {
	const vehicleLessonConflict = await db.lesson.findFirst({
		where: {
			vehicleId,
			status: { not: LessonStatus.CANCELLED },
			startTime: { lt: end },
			endTime: { gt: start },
			...(options?.excludeLessonId
				? { id: { not: options.excludeLessonId } }
				: {}),
		},
		select: { id: true },
	});
	if (vehicleLessonConflict) {
		return true;
	}

	const vehicleEventConflict = await db.instructorEvent.findFirst({
		where: {
			vehicleId,
			type: EventType.DRIVE,
			isActive: true,
			startTime: { lt: end },
			endTime: { gt: start },
		},
		select: { id: true },
	});

	return vehicleEventConflict !== null;
}

export async function assertVehicleAvailableForBooking(
	db: DbClient,
	instructorId: string,
	vehicleId: string,
	courseSchoolId: string,
	start: Date,
	end: Date,
	options?: { excludeLessonId?: string },
): Promise<void> {
	const vehicleInSchool = await db.vehicle.findFirst({
		where: {
			id: vehicleId,
			schoolId: courseSchoolId,
			isActive: true,
			availabilityStatus: VehicleAvailabilityStatus.ACTIVE,
		},
		select: { id: true },
	});
	if (!vehicleInSchool) {
		throw AppError.badRequest('Vehicle is not for this driving school');
	}
	await validateVehicleForInstructor(instructorId, vehicleId, db);

	const hasConflict = await vehicleHasBookingConflict(
		db,
		vehicleId,
		start,
		end,
		{
			excludeLessonId: options?.excludeLessonId,
		},
	);
	if (hasConflict) {
		throw AppError.conflict('Vehicle is already in use');
	}
}

export async function findAvailableVehicleIdForStudentBooking(
	db: DbClient,
	instructorId: string,
	schoolId: string,
	start: Date,
	end: Date,
): Promise<string> {
	const school = await db.drivingSchool.findUnique({
		where: { id: schoolId },
		select: { defaultVehicleId: true },
	});

	const candidates = await db.vehicle.findMany({
		where: {
			schoolId,
			isActive: true,
			availabilityStatus: VehicleAvailabilityStatus.ACTIVE,
		},
		select: { id: true },
		orderBy: { createdAt: 'asc' },
	});

	const ids = candidates.map((v) => v.id);
	const orderedIds =
		school?.defaultVehicleId && ids.includes(school.defaultVehicleId)
			? [
				school.defaultVehicleId,
				...ids.filter((id) => id !== school.defaultVehicleId),
			]
			: ids;

	for (const vehicleId of orderedIds) {
		try {
			await validateVehicleForInstructor(instructorId, vehicleId, db);
		} catch {
			continue;
		}

		if (!(await vehicleHasBookingConflict(db, vehicleId, start, end))) {
			return vehicleId;
		}
	}

	throw AppError.conflict('No available vehicle for this time slot');
}
