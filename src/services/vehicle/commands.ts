import type { VehicleAvailabilityStatus } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import { parseUuidParam } from '../../lib/validation/uuid';
import { getSchoolOwnedByUser, loadVehicleForOwner } from './access';
import {
	assertVehicleRegistrationUnique,
	buildVehicleCreateData,
	buildVehicleUpdateData,
	loadActiveVehicleForOwnerOrThrow,
	parseVehicleWriteBodyOrThrow,
} from './commandHelpers';
import { vehicleToResponse } from './mappers';
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

		const existingVehicleCount = await prisma.vehicle.count({
			where: { schoolId },
		});
		const isFirstVehicleForSchool = existingVehicleCount === 0;

		const created = await prisma.$transaction(async (tx) => {
			const vehicle = await tx.vehicle.create({
				data: buildVehicleCreateData(schoolId, payload),
			});

			if (isFirstVehicleForSchool) {
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

	const updated = await prisma.vehicle.update({
		where: { id: idParse },
		data: buildVehicleUpdateData(patchPayload),
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

	const updated = await prisma.vehicle.update({
		where: { id: vehicleId },
		data: buildVehicleUpdateData(payload),
	});

	return vehicleToResponse(updated);
}

export async function updateVehicleStatusForUser(
	userId: string,
	vehicleId: string,
	status: VehicleAvailabilityStatus,
): Promise<VehicleResponse> {
	await loadActiveVehicleForOwnerOrThrow(userId, vehicleId);

	const updated = await prisma.vehicle.update({
		where: { id: vehicleId },
		data: { availabilityStatus: status },
	});

	return vehicleToResponse(updated);
}

export async function deleteVehicleForUser(
	userId: string,
	vehicleId: string,
): Promise<{ id: string }> {
	const loaded = await loadVehicleForOwner(userId, vehicleId);
	if (!loaded.ok) {
		if (loaded.notFound) {
			throw AppError.notFound('Vehicle not found');
		}
		throw AppError.forbidden('Forbidden');
	}

	if (!loaded.vehicle.isActive) {
		return { id: vehicleId };
	}

	await prisma.vehicle.update({
		where: { id: vehicleId },
		data: { isActive: false },
	});

	return { id: vehicleId };
}
