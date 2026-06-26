import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import {
	type OptionalVehicleFields,
	type OptionalVehiclePatch,
	parseVehicleWriteBody,
} from '../../schemas/vehicle.schemas';
import { loadVehicleForOwner } from './access';

const prisma = getPrisma();

type VehicleWritePayload = Extract<
	ReturnType<typeof parseVehicleWriteBody>,
	{ ok: true }
>;

type VehicleOwnerRow = {
	id: string;
	schoolId: string;
	isActive: boolean;
};

export function parseVehicleWriteBodyOrThrow(
	body: Record<string, unknown>,
	mode: 'create' | 'patch',
): VehicleWritePayload {
	const payload = parseVehicleWriteBody(body, mode);
	if (!payload.ok) {
		throw AppError.badRequest(payload.error);
	}
	return payload;
}

export async function loadActiveVehicleForOwnerOrThrow(
	userId: string,
	vehicleId: string,
): Promise<VehicleOwnerRow> {
	const loaded = await loadVehicleForOwner(userId, vehicleId);
	if (!loaded.ok) {
		if (loaded.notFound) {
			throw AppError.notFound('Vehicle not found');
		}
		throw AppError.forbidden('Forbidden');
	}

	if (!loaded.vehicle.isActive) {
		throw AppError.notFound('Vehicle not found');
	}

	return loaded.vehicle;
}

export async function assertVehicleRegistrationUnique(
	schoolId: string,
	registrationNumber: string,
	options: { excludeVehicleId?: string } = {},
): Promise<void> {
	const duplicate = await prisma.vehicle.findFirst({
		where: {
			schoolId,
			registrationNumber,
			...(options.excludeVehicleId
				? { id: { not: options.excludeVehicleId } }
				: {}),
		},
	});
	if (duplicate) {
		throw AppError.conflict(
			'registrationNumber already exists for this driving school',
		);
	}
}

export function buildVehicleCreateData(
	schoolId: string,
	payload: VehicleWritePayload,
): Prisma.VehicleUncheckedCreateInput {
	const optional = payload.optional as OptionalVehicleFields;

	return {
		schoolId,
		name: payload.name,
		registrationNumber: payload.registrationNumber,
		inspectionDate: payload.inspectionDate,
		insuranceDate: payload.insuranceDate,
		brand: optional.brand,
		model: optional.model,
		photoUrl: optional.photoUrl,
		modelYear: optional.modelYear,
		mileageKm: optional.mileageKm,
		note: optional.note,
	};
}

export function buildVehicleUpdateData(
	payload: VehicleWritePayload,
): Prisma.VehicleUncheckedUpdateInput {
	const optional = payload.optional as OptionalVehiclePatch;

	return {
		name: payload.name,
		registrationNumber: payload.registrationNumber,
		inspectionDate: payload.inspectionDate,
		insuranceDate: payload.insuranceDate,
		...optional,
	};
}
