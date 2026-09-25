import {
	EventStatus,
	EventType,
	LessonStatus,
	VehicleAvailabilityStatus,
} from '@prisma/client';
import { getPrisma } from '../../lib/prisma';
import {
	polishDayRange,
	subtractWindows,
	timeWindowFromDates,
	type TimeWindow,
} from '../instructor-availability/time';
import { refreshExpiredVehicleUnavailabilitiesForSchool } from '../vehicle/availabilityRefresh';
import { buildScheduleAvailabilityOptions } from './optionsMatrix';

const prisma = getPrisma();

export async function resolveAvailableVehicleWindows(
	schoolId: string,
	date: Date,
	instructorWindows: readonly TimeWindow[],
	policy: { minDurationMinutes: number; maxDurationMinutes: number },
	startStepMinutes: number,
	options: { excludeLessonId?: string; excludeEventId?: string },
): Promise<Map<string, TimeWindow[]>> {
	await refreshExpiredVehicleUnavailabilitiesForSchool(prisma, schoolId);

	const vehicles = await prisma.vehicle.findMany({
		where: {
			schoolId,
			isActive: true,
			availabilityStatus: VehicleAvailabilityStatus.ACTIVE,
		},
		select: { id: true },
	});
	const vehicleIds = vehicles.map((vehicle) => vehicle.id);

	if (vehicleIds.length === 0 || instructorWindows.length === 0) {
		return new Map();
	}

	const dayRange = polishDayRange(date);
	const [lessons, events] = await Promise.all([
		prisma.lesson.findMany({
			where: {
				vehicleId: { in: vehicleIds },
				status: { not: LessonStatus.CANCELLED },
				startTime: { lt: dayRange.end },
				endTime: { gt: dayRange.start },
				...(options.excludeLessonId
					? { id: { not: options.excludeLessonId } }
					: {}),
			},
			select: { vehicleId: true, startTime: true, endTime: true },
		}),
		prisma.instructorEvent.findMany({
			where: {
				vehicleId: { in: vehicleIds },
				type: EventType.DRIVE,
				isActive: true,
				status: { not: EventStatus.CANCELLED },
				startTime: { lt: dayRange.end },
				endTime: { gt: dayRange.start },
				...(options.excludeEventId
					? { id: { not: options.excludeEventId } }
					: {}),
			},
			select: { vehicleId: true, startTime: true, endTime: true },
		}),
	]);
	const usedByVehicle = new Map<string, TimeWindow[]>();

	for (const row of [...lessons, ...events]) {
		if (!row.vehicleId) continue;

		const used = usedByVehicle.get(row.vehicleId) ?? [];

		used.push(timeWindowFromDates(row, dayRange));
		usedByVehicle.set(row.vehicleId, used);
	}

	const available = new Map<string, TimeWindow[]>();

	for (const vehicleId of vehicleIds) {
		const used = usedByVehicle.get(vehicleId) ?? [];
		const freeWindows = instructorWindows.flatMap((window) =>
			subtractWindows(window, used),
		);
		const optionsForVehicle = buildScheduleAvailabilityOptions({
			windows: freeWindows,
			...policy,
			startStepMinutes,
		});

		if (optionsForVehicle.length > 0) {
			available.set(vehicleId, freeWindows);
		}
	}

	return available;
}
