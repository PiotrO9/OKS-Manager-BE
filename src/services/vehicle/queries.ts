import { EventType, LessonStatus } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import {
	getSchoolOwnedByUser,
	loadVehicleWithSchoolForAccess,
	userMayAccessVehicleSchool,
} from './access';
import { vehicleToResponse } from './mappers';
import type { VehicleResponse } from './types';

const prisma = getPrisma();

export async function listVehiclesBySchoolForUser(
	userId: string,
	schoolId: string,
	timeRange?: { start: Date; end: Date },
): Promise<{
	vehicles: VehicleResponse[];
	defaultVehicleId: string | null;
}> {
	const school = await getSchoolOwnedByUser(userId, schoolId);
	if (!school) {
		throw AppError.forbidden('Forbidden');
	}

	const vehicles = await prisma.vehicle.findMany({
		where: { schoolId, isActive: true },
		orderBy: { createdAt: 'asc' },
	});

	const defaultVehicleId = school.defaultVehicleId ?? null;
	let vehiclesWithDefault = vehicles.map((v) => ({
		...v,
		isDefault: defaultVehicleId !== null && v.id === defaultVehicleId,
	}));

	if (timeRange) {
		const { start, end } = timeRange;
		const ids = vehiclesWithDefault.map((v) => v.id);
		if (ids.length > 0) {
			const [busyLessons, busyEvents] = await Promise.all([
				prisma.lesson.findMany({
					where: {
						vehicleId: { in: ids },
						status: { not: LessonStatus.CANCELLED },
						startTime: { lt: end },
						endTime: { gt: start },
					},
					select: { vehicleId: true },
				}),
				prisma.instructorEvent.findMany({
					where: {
						vehicleId: { in: ids },
						type: EventType.DRIVE,
						isActive: true,
						startTime: { lt: end },
						endTime: { gt: start },
					},
					select: { vehicleId: true },
				}),
			]);
			const busy = new Set<string>();
			for (const row of busyLessons) {
				if (row.vehicleId) {
					busy.add(row.vehicleId);
				}
			}
			for (const row of busyEvents) {
				if (row.vehicleId) {
					busy.add(row.vehicleId);
				}
			}
			vehiclesWithDefault = vehiclesWithDefault.filter(
				(v) => !busy.has(v.id),
			);
		}
	}

	return {
		vehicles: vehiclesWithDefault.map(({ isDefault, ...vehicle }) =>
			vehicleToResponse(vehicle, isDefault),
		),
		defaultVehicleId,
	};
}

export async function getVehicleByIdForUser(
	userId: string,
	vehicleId: string,
): Promise<VehicleResponse> {
	const loaded = await loadVehicleWithSchoolForAccess(vehicleId);
	if (loaded.kind === 'missing') {
		throw AppError.notFound('Vehicle not found');
	}
	if (!userMayAccessVehicleSchool(userId, loaded.row.school)) {
		throw AppError.forbidden('Forbidden');
	}

	const { school, ...vehicle } = loaded.row;

	return vehicleToResponse(
		vehicle,
		school.defaultVehicleId !== null &&
			school.defaultVehicleId === vehicle.id,
	);
}
