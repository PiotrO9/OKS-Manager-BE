import {
	instantToPolishDateTime,
	polishLocalDateTimeToDate,
} from '../../lib/polishScheduleTime';

export function addDays(date: Date, days: number): Date {
	const next = new Date(date);
	next.setDate(next.getDate() + days);
	return next;
}

export function atTime(date: Date, hour: number, minute = 0): Date {
	const { date: polishDate } = instantToPolishDateTime(date);
	const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

	return polishLocalDateTimeToDate(polishDate, time);
}

export function timeOnly(hour: number, minute = 0): Date {
	return new Date(Date.UTC(1970, 0, 1, hour, minute, 0, 0));
}

export function dateOnly(date: Date): Date {
	const { date: polishDate } = instantToPolishDateTime(date);

	return new Date(`${polishDate}T00:00:00.000Z`);
}

export type SeedWorkingWindow = {
	dayOfWeek: number;
	startTime: Date;
	endTime: Date;
};

function timeOnlyMinutes(value: Date): number {
	return value.getUTCHours() * 60 + value.getUTCMinutes();
}

export function resolveSeedWorkingSlot(
	anchor: Date,
	windows: readonly SeedWorkingWindow[],
	durationMinutes: number,
	slotIndex = 0,
): { start: Date; end: Date } {
	if (durationMinutes <= 0) {
		throw new Error('Seed slot duration must be positive');
	}

	for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
		const date = addDays(anchor, dayOffset);
		const dayOfWeek = instantToPolishDateTime(date).dayOfWeek;
		const window = windows.find((item) => item.dayOfWeek === dayOfWeek);

		if (!window) continue;

		const windowStart = timeOnlyMinutes(window.startTime);
		const windowEnd = timeOnlyMinutes(window.endTime);
		const availableMinutes = windowEnd - windowStart;

		if (availableMinutes < durationMinutes) continue;

		const possibleStarts =
			Math.floor((availableMinutes - durationMinutes) / 60) + 1;
		const startMinute =
			windowStart + (Math.abs(slotIndex) % possibleStarts) * 60;
		const endMinute = startMinute + durationMinutes;

		return {
			start: atTime(date, Math.floor(startMinute / 60), startMinute % 60),
			end: atTime(date, Math.floor(endMinute / 60), endMinute % 60),
		};
	}

	throw new Error(
		'Instructor has no working window long enough for seed slot',
	);
}

export function pick<T>(items: readonly T[], index: number): T {
	return items[index % items.length]!;
}
