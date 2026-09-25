import { describe, expect, it } from 'vitest';
import { buildScheduleAvailabilityOptions } from '../../services/schedule-validation/options';

describe('buildScheduleAvailabilityOptions', () => {
	it('creates starts and ends only inside free windows', () => {
		expect(
			buildScheduleAvailabilityOptions({
				windows: [
					{ start: 8 * 60, end: 10 * 60 },
					{ start: 11 * 60, end: 12 * 60 + 30 },
				],
				minDurationMinutes: 60,
				maxDurationMinutes: 90,
				startStepMinutes: 60,
			}),
		).toEqual([
			{ startTime: '08:00', endTimes: ['09:00', '09:15', '09:30'] },
			{ startTime: '09:00', endTimes: ['10:00'] },
			{ startTime: '11:00', endTimes: ['12:00', '12:15', '12:30'] },
		]);
	});

	it('allows a slot starting exactly when a previous window ended', () => {
		const options = buildScheduleAvailabilityOptions({
			windows: [{ start: 10 * 60, end: 11 * 60 }],
			minDurationMinutes: 60,
			maxDurationMinutes: 120,
			startStepMinutes: 15,
		});

		expect(options).toEqual([{ startTime: '10:00', endTimes: ['11:00'] }]);
	});

	it('returns no options for a window shorter than the minimum', () => {
		expect(
			buildScheduleAvailabilityOptions({
				windows: [{ start: 10 * 60, end: 10 * 60 + 45 }],
				minDurationMinutes: 60,
				maxDurationMinutes: 120,
				startStepMinutes: 15,
			}),
		).toEqual([]);
	});
});
