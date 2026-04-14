import type { SchoolSettings } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
	buildInstructorWorkingHoursDefaultRows,
	daysOfWeekFromWorkingMask,
} from '../../lib/instructorDefaultWorkingHours';

function timeUtc(hours: number, minutes: number): Date {
	return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0, 0));
}

function makeSettings(
	overrides: Pick<
		SchoolSettings,
		'workingDaysMask' | 'workingHoursStart' | 'workingHoursEnd'
	>,
): SchoolSettings {
	return overrides as SchoolSettings;
}

describe('daysOfWeekFromWorkingMask', () => {
	it('maps default mask 62 to Monday–Friday', () => {
		expect(daysOfWeekFromWorkingMask(62)).toEqual([1, 2, 3, 4, 5]);
	});

	it('maps Sunday and Saturday bits to [0, 6]', () => {
		expect(daysOfWeekFromWorkingMask(0b1000001)).toEqual([0, 6]);
	});

	it('returns an empty array for mask 0', () => {
		expect(daysOfWeekFromWorkingMask(0)).toEqual([]);
	});
});

describe('buildInstructorWorkingHoursDefaultRows', () => {
	it('uses school working hours when mask and interval are valid', () => {
		const start = timeUtc(9, 0);
		const end = timeUtc(17, 0);
		const rows = buildInstructorWorkingHoursDefaultRows(
			makeSettings({
				workingDaysMask: 62,
				workingHoursStart: start,
				workingHoursEnd: end,
			}),
		);
		expect(rows).toHaveLength(5);
		expect(rows.map((r) => r.dayOfWeek)).toEqual([1, 2, 3, 4, 5]);
		for (const row of rows) {
			expect(row.startTime.getTime()).toBe(start.getTime());
			expect(row.endTime.getTime()).toBe(end.getTime());
		}
	});

	it('falls back to Mon–Fri 8:00–18:00 UTC when settings is null', () => {
		const rows = buildInstructorWorkingHoursDefaultRows(null);
		expect(rows).toHaveLength(5);
		expect(rows.map((r) => r.dayOfWeek)).toEqual([1, 2, 3, 4, 5]);
		const expectedStart = timeUtc(8, 0);
		const expectedEnd = timeUtc(18, 0);
		for (const row of rows) {
			expect(row.startTime.getTime()).toBe(expectedStart.getTime());
			expect(row.endTime.getTime()).toBe(expectedEnd.getTime());
		}
	});

	it('falls back to Mon–Fri 8:00–18:00 when workingDaysMask yields no days', () => {
		const rows = buildInstructorWorkingHoursDefaultRows(
			makeSettings({
				workingDaysMask: 0,
				workingHoursStart: timeUtc(9, 0),
				workingHoursEnd: timeUtc(17, 0),
			}),
		);
		expect(rows).toHaveLength(5);
		expect(rows.map((r) => r.dayOfWeek)).toEqual([1, 2, 3, 4, 5]);
	});

	it('uses fallback 8:00–18:00 UTC for hours when start >= end but keeps days from mask', () => {
		const rows = buildInstructorWorkingHoursDefaultRows(
			makeSettings({
				workingDaysMask: 62,
				workingHoursStart: timeUtc(18, 0),
				workingHoursEnd: timeUtc(9, 0),
			}),
		);
		expect(rows).toHaveLength(5);
		const expectedStart = timeUtc(8, 0);
		const expectedEnd = timeUtc(18, 0);
		for (const row of rows) {
			expect(row.startTime.getTime()).toBe(expectedStart.getTime());
			expect(row.endTime.getTime()).toBe(expectedEnd.getTime());
		}
	});
});
