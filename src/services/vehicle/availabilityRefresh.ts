import { Prisma, PrismaClient, VehicleAvailabilityStatus } from '@prisma/client';

type DbClient = Prisma.TransactionClient | PrismaClient;

export type VehicleUnavailabilityRefreshRow = {
	id: string;
	availabilityStatus: VehicleAvailabilityStatus;
	unavailableUntil: Date | null;
};

export function getUtcDayStart(value = new Date()): Date {
	return new Date(
		Date.UTC(
			value.getUTCFullYear(),
			value.getUTCMonth(),
			value.getUTCDate(),
		),
	);
}

export function shouldRefreshExpiredVehicleUnavailability(
	vehicle: VehicleUnavailabilityRefreshRow,
	now = new Date(),
): boolean {
	return (
		vehicle.availabilityStatus === VehicleAvailabilityStatus.UNAVAILABLE &&
		vehicle.unavailableUntil !== null &&
		vehicle.unavailableUntil.getTime() < getUtcDayStart(now).getTime()
	);
}

// Read-repair dla OM-4: do czasu dodania crona przywracamy status przy bezpiecznym odczycie danych.
export async function refreshExpiredVehicleUnavailability<
	T extends VehicleUnavailabilityRefreshRow,
>(db: DbClient, vehicle: T, now = new Date()): Promise<T> {
	if (!shouldRefreshExpiredVehicleUnavailability(vehicle, now)) {
		return vehicle;
	}

	await db.vehicle.update({
		where: { id: vehicle.id },
		data: {
			availabilityStatus: VehicleAvailabilityStatus.ACTIVE,
			unavailableUntil: null,
		},
	});

	return {
		...vehicle,
		availabilityStatus: VehicleAvailabilityStatus.ACTIVE,
		unavailableUntil: null,
	};
}

export async function refreshExpiredVehicleUnavailabilities<
	T extends VehicleUnavailabilityRefreshRow,
>(db: DbClient, vehicles: T[], now = new Date()): Promise<T[]> {
	return Promise.all(
		vehicles.map((vehicle) =>
			refreshExpiredVehicleUnavailability(db, vehicle, now),
		),
	);
}

export async function refreshExpiredVehicleUnavailabilitiesForSchool(
	db: DbClient,
	schoolId: string,
	now = new Date(),
): Promise<void> {
	await db.vehicle.updateMany({
		where: {
			schoolId,
			isActive: true,
			availabilityStatus: VehicleAvailabilityStatus.UNAVAILABLE,
			unavailableUntil: { lt: getUtcDayStart(now) },
		},
		data: {
			availabilityStatus: VehicleAvailabilityStatus.ACTIVE,
			unavailableUntil: null,
		},
	});
}
