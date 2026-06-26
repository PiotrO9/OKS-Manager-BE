export function addDays(date: Date, days: number): Date {
	const next = new Date(date);
	next.setDate(next.getDate() + days);
	return next;
}

export function atTime(date: Date, hour: number, minute = 0): Date {
	const next = new Date(date);
	next.setHours(hour, minute, 0, 0);
	return next;
}

export function timeOnly(hour: number, minute = 0): Date {
	return new Date(Date.UTC(1970, 0, 1, hour, minute, 0, 0));
}

export function dateOnly(date: Date): Date {
	return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

export function pick<T>(items: readonly T[], index: number): T {
	return items[index % items.length]!;
}
