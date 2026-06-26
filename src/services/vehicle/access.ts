import type { DrivingSchool } from '@prisma/client';
import { getPrisma } from '../../lib/prisma';
import type { VehicleForAccessRow } from './types';

const prisma = getPrisma();

export async function getSchoolOwnedByUser(
	userId: string,
	schoolId: string,
): Promise<DrivingSchool | null> {
	const school = await prisma.drivingSchool.findUnique({
		where: { id: schoolId },
	});
	if (!school || school.deletedAt !== null || school.ownerId !== userId) {
		return null;
	}
	return school;
}

export async function loadVehicleWithSchoolForAccess(
	vehicleId: string,
): Promise<{ kind: 'missing' } | { kind: 'ok'; row: VehicleForAccessRow }> {
	const row = await prisma.vehicle.findUnique({
		where: { id: vehicleId },
		select: {
			id: true,
			schoolId: true,
			name: true,
			registrationNumber: true,
			isActive: true,
			inspectionDate: true,
			insuranceDate: true,
			brand: true,
			model: true,
			photoUrl: true,
			modelYear: true,
			mileageKm: true,
			note: true,
			availabilityStatus: true,
			createdAt: true,
			school: {
				select: {
					ownerId: true,
					deletedAt: true,
					defaultVehicleId: true,
				},
			},
		},
	});
	if (!row) {
		return { kind: 'missing' };
	}
	return { kind: 'ok', row };
}

export function userMayAccessVehicleSchool(
	userId: string,
	school: { ownerId: string; deletedAt: Date | null },
): boolean {
	return school.deletedAt === null && school.ownerId === userId;
}

export async function loadVehicleForOwner(
	userId: string,
	vehicleId: string,
): Promise<
	| { ok: true; vehicle: { id: string; schoolId: string; isActive: boolean } }
	| { ok: false; notFound: boolean }
> {
	const vehicle = await prisma.vehicle.findUnique({
		where: { id: vehicleId },
		select: { id: true, schoolId: true, isActive: true },
	});
	if (!vehicle) {
		return { ok: false, notFound: true };
	}
	const allowed = await getSchoolOwnedByUser(userId, vehicle.schoolId);
	if (!allowed) {
		return { ok: false, notFound: false };
	}
	return { ok: true, vehicle };
}
