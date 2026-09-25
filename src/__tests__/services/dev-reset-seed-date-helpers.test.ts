import { describe, expect, it } from 'vitest';
import {
	atTime,
	dateOnly,
	resolveSeedWorkingSlot,
} from '../../services/devResetSeed/dateHelpers';

describe('dev reset seed date helpers', () => {
	it('creates seeded schedule instants from Polish wall-clock time', () => {
		expect(
			atTime(new Date('2026-07-15T12:00:00.000Z'), 17).toISOString(),
		).toBe('2026-07-15T15:00:00.000Z');
		expect(
			atTime(new Date('2026-01-15T12:00:00.000Z'), 17).toISOString(),
		).toBe('2026-01-15T16:00:00.000Z');
	});

	it('derives a date-only value from the Polish calendar day', () => {
		expect(
			dateOnly(new Date('2026-09-24T22:30:00.000Z')).toISOString(),
		).toBe('2026-09-25T00:00:00.000Z');
	});

	it('moves a weekend anchor to the next configured working day', () => {
		const slot = resolveSeedWorkingSlot(
			new Date('2026-09-26T12:00:00.000Z'),
			[
				{
					dayOfWeek: 1,
					startTime: new Date('1970-01-01T08:00:00.000Z'),
					endTime: new Date('1970-01-01T17:00:00.000Z'),
				},
			],
			60,
		);

		expect(slot.start.toISOString()).toBe('2026-09-28T06:00:00.000Z');
		expect(slot.end.toISOString()).toBe('2026-09-28T07:00:00.000Z');
	});

	it('keeps seeded slots inside the configured working window', () => {
		const slot = resolveSeedWorkingSlot(
			new Date('2026-09-25T12:00:00.000Z'),
			[
				{
					dayOfWeek: 5,
					startTime: new Date('1970-01-01T09:00:00.000Z'),
					endTime: new Date('1970-01-01T16:00:00.000Z'),
				},
			],
			90,
			99,
		);

		expect(slot.start.toISOString()).toBe('2026-09-25T10:00:00.000Z');
		expect(slot.end.toISOString()).toBe('2026-09-25T11:30:00.000Z');
	});

	it('fails fast when an instructor has no usable working window', () => {
		expect(() =>
			resolveSeedWorkingSlot(
				new Date('2026-09-25T12:00:00.000Z'),
				[],
				60,
			),
		).toThrow('Instructor has no working window');
	});
});
