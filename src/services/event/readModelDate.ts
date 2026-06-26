export function utcDayFreeWindowsToIso(
	dayAnchor: Date,
	windows: { start: number; end: number }[],
): { startTime: string; endTime: string }[] {
	const dayUtcMidnight = new Date(
		Date.UTC(
			dayAnchor.getUTCFullYear(),
			dayAnchor.getUTCMonth(),
			dayAnchor.getUTCDate(),
		),
	);
	return windows.map((w) => ({
		startTime: new Date(
			dayUtcMidnight.getTime() + w.start * 60_000,
		).toISOString(),
		endTime: new Date(
			dayUtcMidnight.getTime() + w.end * 60_000,
		).toISOString(),
	}));
}

export function buildInstructorEventDateOverlapWhere(
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
