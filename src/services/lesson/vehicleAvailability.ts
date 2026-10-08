import {
	EventType,
	EventStatus,
	LessonStatus,
	Prisma,
	PrismaClient,
	VehicleAvailabilityStatus,
} from '@prisma/client';
import { ScheduleDomainError } from '../../lib/http/ScheduleDomainError';
import { validateVehicleForInstructor } from '../../lib/vehicle.helpers';
import { refreshExpiredVehicleUnavailabilitiesForSchool } from '../vehicle/availabilityRefresh';

type DbClient = Prisma.TransactionClient | PrismaClient;

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
			status: { not: EventStatus.CANCELLED },
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
	await refreshExpiredVehicleUnavailabilitiesForSchool(db, courseSchoolId);

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
		throw ScheduleDomainError.badRequestFor(
			'VEHICLE_UNAVAILABLE',
			'Vehicle is not for this driving school',
		);
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
		throw ScheduleDomainError.conflictFor(
			'VEHICLE_BUSY',
			'Vehicle is already in use',
		);
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
	await refreshExpiredVehicleUnavailabilitiesForSchool(db, schoolId);

	const candidates = await db.vehicle.findMany({
		where: {
			schoolId,
			isActive: true,
			availabilityStatus: VehicleAvailabilityStatus.ACTIVE,
		},
		select: { id: true },
		orderBy: { createdAt: 'asc' },
	});

	const vehicleIds = candidates.map((vehicle) => vehicle.id);
	const orderedIds =
		school?.defaultVehicleId && vehicleIds.includes(school.defaultVehicleId)
			? [
					school.defaultVehicleId,
					...vehicleIds.filter(
						(id) => id !== school.defaultVehicleId,
					),
				]
			: vehicleIds;

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

	throw ScheduleDomainError.conflictFor(
		'NO_VEHICLE_AVAILABLE',
		'No available vehicle for this time slot',
	);
}
