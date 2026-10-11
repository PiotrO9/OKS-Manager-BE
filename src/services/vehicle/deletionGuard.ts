import {
	EventStatus,
	EventType,
	LessonStatus,
	type Prisma,
} from '@prisma/client';

export type VehicleDeletionBlockReason = 'DEFAULT' | 'SCHEDULED_LESSONS';

export async function getVehiclesWithUpcomingLessons(
	db: Prisma.TransactionClient,
	vehicleIds: string[],
	now: Date,
): Promise<Set<string>> {
	if (vehicleIds.length === 0) return new Set();

	const [lessons, events] = await Promise.all([
		db.lesson.findMany({
			where: {
				vehicleId: { in: vehicleIds },
				deletedAt: null,
				status: LessonStatus.SCHEDULED,
				endTime: { gt: now },
			},
			select: { vehicleId: true },
		}),
		db.instructorEvent.findMany({
			where: {
				vehicleId: { in: vehicleIds },
				type: EventType.DRIVE,
				isActive: true,
				status: EventStatus.PLANNED,
				endTime: { gt: now },
			},
			select: { vehicleId: true },
		}),
	]);

	return new Set(
		[...lessons, ...events]
			.map((row) => row.vehicleId)
			.filter((id): id is string => id !== null),
	);
}
