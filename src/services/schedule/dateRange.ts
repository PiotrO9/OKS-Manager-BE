import { LessonStatus } from '@prisma/client';

export function buildDateRangeWhere(
	dateFrom: string,
	dateTo: string,
	excludeCancelled = false,
) {
	const rangeStart = new Date(`${dateFrom}T00:00:00.000Z`);
	const rangeEnd = new Date(`${dateTo}T23:59:59.999Z`);
	const overlap = {
		startTime: { lt: rangeEnd },
		endTime: { gt: rangeStart },
	};
	if (excludeCancelled) {
		return {
			...overlap,
			status: { not: LessonStatus.CANCELLED },
		};
	}
	return overlap;
}
