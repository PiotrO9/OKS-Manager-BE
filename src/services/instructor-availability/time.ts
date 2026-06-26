export type TimeWindow = { start: number; end: number };

export function timeToMinutes(hhmm: string): number {
	const [h, m] = hhmm.split(':').map(Number);
	return (h ?? 0) * 60 + (m ?? 0);
}

export function dbTimeToHHmm(date: Date): string {
	const h = String(date.getUTCHours()).padStart(2, '0');
	const m = String(date.getUTCMinutes()).padStart(2, '0');
	return `${h}:${m}`;
}

export function hhmmToDbTime(hhmm: string): Date {
	const [h, m] = hhmm.split(':').map(Number);
	const d = new Date(0);
	d.setUTCHours(h ?? 0, m ?? 0, 0, 0);
	return d;
}

export function yyyymmddToDate(dateStr: string): Date {
	const [y, mo, d] = dateStr.split('-').map(Number);
	return new Date(Date.UTC(y ?? 0, (mo ?? 1) - 1, d ?? 1));
}

export function minutesToHHmm(minutes: number): string {
	const h = String(Math.floor(minutes / 60)).padStart(2, '0');
	const m = String(minutes % 60).padStart(2, '0');
	return `${h}:${m}`;
}

export function dateToYYYYMMDD(date: Date): string {
	const y = date.getUTCFullYear();
	const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
	const d = String(date.getUTCDate()).padStart(2, '0');
	return `${y}-${mo}-${d}`;
}

export function subtractWindows(base: TimeWindow, used: TimeWindow[]): TimeWindow[] {
	const sorted = [...used].sort((a, b) => a.start - b.start);
	const free: TimeWindow[] = [];
	let cursor = base.start;

	for (const block of sorted) {
		if (block.start >= base.end) break;
		const blockStart = Math.max(block.start, base.start);
		const blockEnd = Math.min(block.end, base.end);
		if (blockStart > cursor) {
			free.push({ start: cursor, end: blockStart });
		}
		cursor = Math.max(cursor, blockEnd);
	}

	if (cursor < base.end) {
		free.push({ start: cursor, end: base.end });
	}

	return free;
}

export function splitWindowIntoSlots(
	window: TimeWindow,
	slotDurationMinutes: number,
): TimeWindow[] {
	const slots: TimeWindow[] = [];
	let cursor = window.start;

	while (cursor + slotDurationMinutes <= window.end) {
		slots.push({ start: cursor, end: cursor + slotDurationMinutes });
		cursor += slotDurationMinutes;
	}

	return slots;
}

export function datesAreSameUtcDay(startTime: Date, endTime: Date): boolean {
	return (
		startTime.getUTCFullYear() === endTime.getUTCFullYear() &&
		startTime.getUTCMonth() === endTime.getUTCMonth() &&
		startTime.getUTCDate() === endTime.getUTCDate()
	);
}

export function utcDateOnly(date: Date): Date {
	return new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
	);
}

export function nextUtcDay(date: Date): Date {
	return new Date(
		Date.UTC(
			date.getUTCFullYear(),
			date.getUTCMonth(),
			date.getUTCDate() + 1,
		),
	);
}

export function timeWindowFromDates(row: {
	startTime: Date;
	endTime: Date;
}): TimeWindow {
	return {
		start: row.startTime.getUTCHours() * 60 + row.startTime.getUTCMinutes(),
		end: row.endTime.getUTCHours() * 60 + row.endTime.getUTCMinutes(),
	};
}
