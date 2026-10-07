import { VehicleAvailabilityStatus, type Prisma } from '@prisma/client';
import { ScheduleDomainError } from './http/ScheduleDomainError';
import { polishTodayYyyymmdd } from './polishScheduleTime';
import { getPrisma } from './prisma';

type DbClient = Prisma.TransactionClient | ReturnType<typeof getPrisma>;

/**
 * Sprawdza, że pojazd jest aktywny i należy do szkoły, do której przypisany jest instruktor.
 */
export async function validateVehicleForInstructor(
	instructorId: string,
	vehicleId: string,
	db: DbClient = getPrisma(),
	options?: { requireAvailable?: boolean },
): Promise<void> {
	const vehicle = await db.vehicle.findFirst({
		where: { id: vehicleId, isActive: true },
		select: {
			id: true,
			schoolId: true,
			availabilityStatus: true,
			unavailableUntil: true,
		},
	});
	if (!vehicle) {
		throw ScheduleDomainError.notFoundFor(
			'VEHICLE_UNAVAILABLE',
			'Vehicle not found',
		);
	}
	const unavailableUntil = vehicle.unavailableUntil
		? vehicle.unavailableUntil.toISOString().slice(0, 10)
		: null;
	const expiredTemporaryUnavailability =
		vehicle.availabilityStatus === VehicleAvailabilityStatus.UNAVAILABLE &&
		unavailableUntil !== null &&
		unavailableUntil < polishTodayYyyymmdd();

	if (expiredTemporaryUnavailability) {
		await db.vehicle.update({
			where: { id: vehicle.id },
			data: {
				availabilityStatus: VehicleAvailabilityStatus.ACTIVE,
				unavailableUntil: null,
			},
		});
	}

	if (
		options?.requireAvailable &&
		vehicle.availabilityStatus !== VehicleAvailabilityStatus.ACTIVE &&
		!expiredTemporaryUnavailability
	) {
		throw ScheduleDomainError.badRequestFor(
			'VEHICLE_UNAVAILABLE',
			'Vehicle is unavailable',
		);
	}
	const link = await db.instructorSchool.findFirst({
		where: { instructorId, schoolId: vehicle.schoolId },
		select: { id: true },
	});
	if (!link) {
		throw ScheduleDomainError.badRequestFor(
			'VEHICLE_UNAVAILABLE',
			'Vehicle is not in a school assigned to this instructor',
		);
	}
}
