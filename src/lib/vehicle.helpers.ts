import type { Prisma } from '@prisma/client';
import { AppError } from './http/AppError';
import { getPrisma } from './prisma';

type DbClient = Prisma.TransactionClient | ReturnType<typeof getPrisma>;

/**
 * Sprawdza, że pojazd jest aktywny i należy do szkoły, do której przypisany jest instruktor.
 */
export async function validateVehicleForInstructor(
	instructorId: string,
	vehicleId: string,
	db: DbClient = getPrisma(),
): Promise<void> {
	const vehicle = await db.vehicle.findFirst({
		where: { id: vehicleId, isActive: true },
		select: { id: true, schoolId: true },
	});
	if (!vehicle) {
		throw AppError.notFound('Vehicle not found');
	}
	const link = await db.instructorSchool.findFirst({
		where: { instructorId, schoolId: vehicle.schoolId },
		select: { id: true },
	});
	if (!link) {
		throw AppError.badRequest(
			'Vehicle is not in a school assigned to this instructor',
		);
	}
}
