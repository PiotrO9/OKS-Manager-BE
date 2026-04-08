import type { SchoolSettings } from '@prisma/client';

export type InstructorDefaultHourRow = {
	dayOfWeek: number;
	startTime: Date;
	endTime: Date;
};

/**
 * Bit `d` w `workingDaysMask` odpowiada `Date.getDay()`: 0 = niedziela … 6 = sobota.
 * Domyślna wartość w schemacie (62) = bity 1–5 ustawione = pon–pt.
 */
export function daysOfWeekFromWorkingMask(mask: number): number[] {
	const masked = mask & 0x7f;
	const result: number[] = [];
	for (let d = 0; d <= 6; d += 1) {
		if ((masked & (1 << d)) !== 0) {
			result.push(d);
		}
	}
	return result;
}

function timeOn1970Utc(hours: number, minutes: number): Date {
	return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0, 0));
}

function fallbackWeekdayRows(): InstructorDefaultHourRow[] {
	const startTime = timeOn1970Utc(8, 0);
	const endTime = timeOn1970Utc(18, 0);
	return [1, 2, 3, 4, 5].map((dayOfWeek) => ({
		dayOfWeek,
		startTime,
		endTime,
	}));
}

/**
 * Buduje wiersze do `instructor_working_hours_default` z ustawień szkoły lub fallback pn–pt 8:00–18:00 UTC na epoce DATE.
 */
export function buildInstructorWorkingHoursDefaultRows(
	settings: SchoolSettings | null,
): InstructorDefaultHourRow[] {
	if (!settings) {
		return fallbackWeekdayRows();
	}

	let days = daysOfWeekFromWorkingMask(settings.workingDaysMask);
	if (days.length === 0) {
		return fallbackWeekdayRows();
	}

	if (
		settings.workingHoursStart.getTime() >=
		settings.workingHoursEnd.getTime()
	) {
		const startTime = timeOn1970Utc(8, 0);
		const endTime = timeOn1970Utc(18, 0);
		return days.map((dayOfWeek) => ({ dayOfWeek, startTime, endTime }));
	}

	const startTime = new Date(settings.workingHoursStart);
	const endTime = new Date(settings.workingHoursEnd);
	return days.map((dayOfWeek) => ({
		dayOfWeek,
		startTime,
		endTime,
	}));
}
