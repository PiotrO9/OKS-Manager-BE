import { describe, expect, it } from 'vitest';
import { AppError } from '../../lib/http/AppError';
import {
	instantToPolishDateTime,
	parsePolishScheduleWindow,
	polishDayBounds,
	polishLocalDateTimeToDate,
	polishTodayYyyymmdd,
} from '../../lib/polishScheduleTime';

describe('Polish schedule time', () => {
	it.each([
		['2026-01-15', '10:00', '2026-01-15T09:00:00.000Z'],
		['2026-07-15', '10:00', '2026-07-15T08:00:00.000Z'],
	])('converts %s %s to the correct instant', (date, time, expected) => {
		expect(polishLocalDateTimeToDate(date, time).toISOString()).toBe(
			expected,
		);
	});

	it.each(['2026-03-29T02:30', '2026-10-25T02:30'])(
		'rejects nonexistent or ambiguous local time %s',
		(value) => {
			const [date, time] = value.split('T');
			expect(() => polishLocalDateTimeToDate(date!, time!)).toThrow(
				AppError,
			);
		},
	);

	it('builds Polish day bounds across the spring DST change', () => {
		const bounds = polishDayBounds('2026-03-29');

		expect(bounds.start.toISOString()).toBe('2026-03-28T23:00:00.000Z');
		expect(bounds.end.toISOString()).toBe('2026-03-29T22:00:00.000Z');
		expect(bounds.end.getTime() - bounds.start.getTime()).toBe(
			23 * 60 * 60 * 1000,
		);
	});

	it('builds a 25-hour Polish day across the autumn DST change', () => {
		const bounds = polishDayBounds('2026-10-25');

		expect(bounds.end.getTime() - bounds.start.getTime()).toBe(
			25 * 60 * 60 * 1000,
		);
	});

	it.each([
		['2026-02-30', '10:00'],
		['2025-02-29', '10:00'],
		['2026-01-01', '24:00'],
		['2026-01-01', '12:60'],
		['2026-01-01', '1:00'],
	])('rejects malformed or impossible local value %s %s', (date, time) => {
		expect(() => polishLocalDateTimeToDate(date, time)).toThrow(AppError);
	});

	it('returns local date, time and weekday for an instant', () => {
		expect(
			instantToPolishDateTime(new Date('2026-09-24T22:30:00.000Z')),
		).toEqual({
			date: '2026-09-25',
			time: '00:30',
			minutes: 30,
			dayOfWeek: 5,
		});
	});

	it('calculates positive same-day duration', () => {
		expect(
			parsePolishScheduleWindow({
				date: '2026-09-24',
				startTime: '09:15',
				endTime: '10:45',
			}),
		).toMatchObject({ durationMinutes: 90 });
	});

	it.each([
		['10:00', '10:00'],
		['11:00', '10:00'],
	])('rejects non-positive duration %s-%s', (startTime, endTime) => {
		expect(() =>
			parsePolishScheduleWindow({
				date: '2026-09-24',
				startTime,
				endTime,
			}),
		).toThrow('startTime must be before endTime');
	});

	it('calculates today in Europe/Warsaw rather than UTC', () => {
		expect(polishTodayYyyymmdd(new Date('2026-09-24T22:30:00.000Z'))).toBe(
			'2026-09-25',
		);
	});
});
