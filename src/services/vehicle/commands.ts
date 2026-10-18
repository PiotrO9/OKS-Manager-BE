import {
	supportedCourseTypesInclude,
	assertSupportedCourseTypeIdsExist,
	assertVehicleCategoriesCanChange,
} from '../../lib/vehicleCourseCategories';
import { runScheduleWriteTransaction } from '../schedule-validation/transaction';
import type { VehicleAvailabilityStatus } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import { parseUuidParam } from '../../lib/validation/uuid';
import type { VehicleAvailabilityStatusPayload } from '../../schemas/vehicle.schemas';
import { getSchoolOwnedByUser } from './access';
import {
	assertVehicleRegistrationUnique,
	buildVehicleCreateData,
	buildVehicleUpdateData,
	loadActiveVehicleForOwnerOrThrow,
	parseVehicleWriteBodyOrThrow,
} from './commandHelpers';
import { vehicleToResponse } from './mappers';
import { getVehiclesWithUpcomingLessons } from './deletionGuard';
import type { VehicleResponse } from './types';

const prisma = getPrisma();

export async function upsertVehicleForUser(
	userId: string,
	body: Record<string, unknown>,
): Promise<{ status: 200 | 201; vehicle: VehicleResponse }> {
	const idParse = parseUuidParam(body.id);
	if (idParse === 'invalid') {
		throw AppError.badRequest('Invalid vehicle id');
	}

	if (idParse === null) {
		const payload = parseVehicleWriteBodyOrThrow(body, 'create');

		const schoolIdParse = parseUuidParam(body.schoolId);
		if (schoolIdParse === null) {
			throw AppError.badRequest('schoolId is required');
		}
		if (schoolIdParse === 'invalid') {
			throw AppError.badRequest('Invalid schoolId');
		}

		const schoolRow = await getSchoolOwnedByUser(userId, schoolIdParse);
		if (!schoolRow) {
			throw AppError.forbidden('Forbidden');
		}

		const schoolId = schoolIdParse;

		await assertVehicleRegistrationUnique(
			schoolId,
			payload.registrationNumber,
		);

		const created = await prisma.$transaction(async (tx) => {
			await tx.$queryRaw`SELECT id FROM driving_schools WHERE id = ${schoolId}::uuid FOR UPDATE`;
			const activeVehicleCount = await tx.vehicle.count({
				where: { schoolId, isActive: true },
			});
			await assertSupportedCourseTypeIdsExist(
				tx,
				payload.supportedCourseTypeIds,
			);
			const vehicle = await tx.vehicle.create({
				include: supportedCourseTypesInclude,
				data: buildVehicleCreateData(schoolId, payload),
			});

			if (activeVehicleCount === 0) {
				await tx.drivingSchool.update({
					where: { id: schoolId },
					data: { defaultVehicleId: vehicle.id },
				});
			}

			return vehicle;
		});

		return { status: 201, vehicle: vehicleToResponse(created) };
	}

	const patchPayload = parseVehicleWriteBodyOrThrow(body, 'patch');

	const existing = await prisma.vehicle.findUnique({
		where: { id: idParse },
		select: {
			id: true,
			schoolId: true,
			isActive: true,
		},
	});

	if (!existing) {
		throw AppError.notFound('Vehicle not found');
	}

	const school = await getSchoolOwnedByUser(userId, existing.schoolId);
	if (!school) {
		throw AppError.forbidden('Forbidden');
	}

	if (!existing.isActive) {
		throw AppError.notFound('Vehicle not found');
	}

	await assertVehicleRegistrationUnique(
		existing.schoolId,
		patchPayload.registrationNumber,
		{ excludeVehicleId: idParse },
	);

	const updated = await runScheduleWriteTransaction(async (tx) => {
		await assertVehicleCategoriesCanChange(
			tx,
			idParse,
			patchPayload.supportedCourseTypeIds,
		);
		return tx.vehicle.update({
			where: { id: idParse },
			data: buildVehicleUpdateData(patchPayload),
			include: supportedCourseTypesInclude,
		});
	});

	return { status: 200, vehicle: vehicleToResponse(updated) };
}

export async function updateVehicleForUser(
	userId: string,
	vehicleId: string,
	body: Record<string, unknown>,
): Promise<VehicleResponse> {
	const vehicle = await loadActiveVehicleForOwnerOrThrow(userId, vehicleId);
	const payload = parseVehicleWriteBodyOrThrow(body, 'patch');

	await assertVehicleRegistrationUnique(
		vehicle.schoolId,
		payload.registrationNumber,
		{ excludeVehicleId: vehicleId },
	);

	const updated = await runScheduleWriteTransaction(async (tx) => {
		await assertVehicleCategoriesCanChange(
			tx,
			vehicleId,
			payload.supportedCourseTypeIds,
		);
		return tx.vehicle.update({
			where: { id: vehicleId },
			data: buildVehicleUpdateData(payload),
			include: supportedCourseTypesInclude,
		});
	});

	return vehicleToResponse(updated);
}

export async function updateVehicleStatusForUser(
	userId: string,
	vehicleId: string,
	payload: VehicleAvailabilityStatusPayload,
): Promise<VehicleResponse> {
	await loadActiveVehicleForOwnerOrThrow(userId, vehicleId);

	const unavailableUntil =
		payload.status === 'UNAVAILABLE'
			? parseUnavailableUntilDate(payload.unavailableUntil)
			: null;

	const updated = await prisma.vehicle.update({
		where: { id: vehicleId },
		data: {
			availabilityStatus: payload.status as VehicleAvailabilityStatus,
			unavailableUntil,
		},
		include: supportedCourseTypesInclude,
	});

	return vehicleToResponse(updated);
}

function parseUnavailableUntilDate(
	value: string | null | undefined,
): Date | null {
	if (!value) return null;

	return new Date(`${value}T00:00:00.000Z`);
}

export async function deleteVehicleForUser(
	userId: string,
	vehicleId: string,
): Promise<{ id: string }> {
	return prisma.$transaction(async (tx) => {
		// Coordinate with setting this vehicle as the school's default.
		await tx.$queryRaw`SELECT id FROM vehicles WHERE id = ${vehicleId}::uuid FOR UPDATE`;
		const loaded = await tx.vehicle.findUnique({
			where: { id: vehicleId },
			select: { id: true, schoolId: true, isActive: true },
		});
		if (!loaded) throw AppError.notFound('Vehicle not found');
		await tx.$queryRaw`SELECT id FROM driving_schools WHERE id = ${loaded.schoolId}::uuid FOR UPDATE`;
		const school = await tx.drivingSchool.findUnique({
			where: { id: loaded.schoolId },
			select: { ownerId: true, deletedAt: true, defaultVehicleId: true },
		});
		if (!school || school.deletedAt !== null || school.ownerId !== userId) {
			throw AppError.forbidden('Forbidden');
		}
		if (!loaded.isActive) return { id: vehicleId };
		const isDefaultVehicle = school.defaultVehicleId === vehicleId;
		if (isDefaultVehicle) {
			const otherActiveVehicles = await tx.vehicle.count({
				where: {
					schoolId: loaded.schoolId,
					isActive: true,
					id: { not: vehicleId },
				},
			});
			if (otherActiveVehicles > 0) {
				throw AppError.conflict(
					'Nie można usunąć domyślnego pojazdu. Najpierw wybierz inny pojazd domyślny.',
				);
			}
		}
		const booked = await getVehiclesWithUpcomingLessons(
			tx,
			[vehicleId],
			new Date(),
		);
		if (booked.has(vehicleId)) {
			throw AppError.conflict(
				'Nie można usunąć pojazdu z trwającymi lub zaplanowanymi lekcjami.',
			);
		}
		if (isDefaultVehicle) {
			await tx.drivingSchool.update({
				where: { id: loaded.schoolId },
				data: { defaultVehicleId: null },
			});
		}
		await tx.vehicle.update({
			where: { id: vehicleId },
			data: { isActive: false },
		});
		return { id: vehicleId };
	});
}
