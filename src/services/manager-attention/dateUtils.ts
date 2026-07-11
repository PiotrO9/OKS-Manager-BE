const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfLocalDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
	const out = new Date(date);
	out.setDate(out.getDate() + days);
	return out;
}

export function currentWeekRange(today: Date): { start: Date; end: Date } {
	const start = startOfLocalDay(today);
	const day = start.getDay();
	const daysFromMonday = day === 0 ? 6 : day - 1;

	start.setDate(start.getDate() - daysFromMonday);

	const end = addDays(start, 7);

	return { start, end };
}

export function toIsoDate(date: Date | null | undefined): string | null {
	if (!date) return null;

	return date.toISOString().slice(0, 10);
}

export function dayTime(date: Date | null | undefined): number {
	if (!date) return Number.MAX_SAFE_INTEGER;

	return Math.floor(startOfLocalDay(date).getTime() / DAY_MS);
}
