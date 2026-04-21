/**
 * Overlap [dateFrom, dateTo] (UTC calendar days) with [startTime, endTime) intervals.
 * Same semantics as schedule `buildDateRangeWhere` for instructor events.
 */
export function buildInstructorEventOverlapWhere(
	dateFrom: string,
	dateTo: string,
): { startTime: { lt: Date }; endTime: { gt: Date } } {
	const rangeStart = new Date(`${dateFrom}T00:00:00.000Z`);
	const rangeEnd = new Date(`${dateTo}T23:59:59.999Z`);
	return {
		startTime: { lt: rangeEnd },
		endTime: { gt: rangeStart },
	};
}
