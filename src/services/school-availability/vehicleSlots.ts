import {
	EventStatus,
	EventType,
	LessonStatus,
	VehicleAvailabilityStatus,
	type PrismaClient,
	type Prisma,
} from '@prisma/client';
import { polishLocalDateTimeToDate } from '../../lib/polishScheduleTime';
import { vehicleCourseTypeWhere } from '../../lib/vehicleCourseCategories';
import { refreshExpiredVehicleUnavailabilitiesForSchool } from '../vehicle/availabilityRefresh';

type Slot = { date: string; startTime: string; endTime: string };

/** Loads the fleet once for the entire search, not once per slot/instructor. */
export async function loadCourseVehicleSlotFilter(
	db: PrismaClient | Prisma.TransactionClient,
	schoolId: string,
	courseTypeId: string,
	dateFrom: string,
	dateTo: string,
): Promise<(slot: Slot) => boolean> {
	await refreshExpiredVehicleUnavailabilitiesForSchool(db, schoolId);
	const vehicles = await db.vehicle.findMany({
		where: {
			schoolId,
			isActive: true,
			availabilityStatus: VehicleAvailabilityStatus.ACTIVE,
			...vehicleCourseTypeWhere(courseTypeId),
		},
		select: { id: true },
	});
	if (!vehicles.length) return () => false;
	const nextDay = new Date(`${dateTo}T12:00:00Z`);
	nextDay.setUTCDate(nextDay.getUTCDate() + 1);
	const rangeStart = polishLocalDateTimeToDate(dateFrom, '00:00');
	const rangeEnd = polishLocalDateTimeToDate(
		nextDay.toISOString().slice(0, 10),
		'00:00',
	);
	const overlap = {
		vehicleId: { in: vehicles.map((vehicle) => vehicle.id) },
		startTime: { lt: rangeEnd },
		endTime: { gt: rangeStart },
	};
	const [lessons, events] = await Promise.all([
		db.lesson.findMany({
			where: { ...overlap, status: { not: LessonStatus.CANCELLED } },
			select: { vehicleId: true, startTime: true, endTime: true },
		}),
		db.instructorEvent.findMany({
			where: {
				...overlap,
				type: EventType.DRIVE,
				isActive: true,
				status: { not: EventStatus.CANCELLED },
			},
			select: { vehicleId: true, startTime: true, endTime: true },
		}),
	]);
	const busyByVehicle = new Map<
		string,
		{ startTime: Date; endTime: Date }[]
	>();
	for (const interval of [...lessons, ...events]) {
		if (!interval.vehicleId) continue;
		const busy = busyByVehicle.get(interval.vehicleId) ?? [];
		busy.push(interval);
		busyByVehicle.set(interval.vehicleId, busy);
	}
	return (slot) => {
		const start = polishLocalDateTimeToDate(slot.date, slot.startTime);
		const end = polishLocalDateTimeToDate(slot.date, slot.endTime);
		return vehicles.some(
			(vehicle) =>
				!(busyByVehicle.get(vehicle.id) ?? []).some(
					(busy) => busy.startTime < end && busy.endTime > start,
				),
		);
	};
}
