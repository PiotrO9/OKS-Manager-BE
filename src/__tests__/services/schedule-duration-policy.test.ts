import { EventType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
	assertScheduleDurationAllowed,
	resolveScheduleDurationPolicy,
	resolveScheduleOptionsPolicy,
} from '../../services/schedule-validation/policy';

function createDb(settings: object | null) {
	return {
		schoolSettings: {
			findUnique: vi.fn().mockResolvedValue(settings),
		},
	} as never;
}

describe('schedule duration policy', () => {
	it('uses practice settings for lessons and drive events', async () => {
		const db = createDb({
			practiceMinDurationMinutes: 50,
			practiceMaxDurationMinutes: 100,
			theoryMinDurationMinutes: 30,
			theoryMaxDurationMinutes: 80,
		});

		await expect(
			resolveScheduleDurationPolicy(db, 'school-1', EventType.DRIVE),
		).resolves.toEqual({
			minDurationMinutes: 50,
			maxDurationMinutes: 100,
		});
	});

	it('uses theory settings for theory events', async () => {
		const db = createDb({
			practiceMinDurationMinutes: 60,
			practiceMaxDurationMinutes: 120,
			theoryMinDurationMinutes: 45,
			theoryMaxDurationMinutes: 90,
		});

		await expect(
			resolveScheduleDurationPolicy(db, 'school-1', EventType.THEORY),
		).resolves.toEqual({
			minDurationMinutes: 45,
			maxDurationMinutes: 90,
		});
	});

	it('loads duration and start-step settings in one query for option lists', async () => {
		const db = createDb({
			practiceMinDurationMinutes: 60,
			practiceMaxDurationMinutes: 120,
			theoryMinDurationMinutes: 45,
			theoryMaxDurationMinutes: 90,
			slotMustStartFullHour: true,
		});

		await expect(
			resolveScheduleOptionsPolicy(db, 'school-1', EventType.DRIVE, 15),
		).resolves.toEqual({
			minDurationMinutes: 60,
			maxDurationMinutes: 120,
			startStepMinutes: 60,
		});
		expect(
			(
				db as unknown as {
					schoolSettings: { findUnique: ReturnType<typeof vi.fn> };
				}
			).schoolSettings.findUnique,
		).toHaveBeenCalledOnce();
	});

	it('rejects a duration below the configured minimum', async () => {
		const db = createDb({
			practiceMinDurationMinutes: 60,
			practiceMaxDurationMinutes: 120,
			theoryMinDurationMinutes: 45,
			theoryMaxDurationMinutes: 90,
		});

		await expect(
			assertScheduleDurationAllowed(db, {
				schoolId: 'school-1',
				kind: 'PRACTICE',
				start: new Date('2026-09-24T08:00:00.000Z'),
				end: new Date('2026-09-24T08:30:00.000Z'),
			}),
		).rejects.toMatchObject({
			statusCode: 400,
			message: 'Duration must be at least 60 minutes',
		});
	});

	it('accepts both duration boundaries', async () => {
		const db = createDb(null);

		await expect(
			assertScheduleDurationAllowed(db, {
				schoolId: 'school-1',
				kind: EventType.THEORY,
				start: new Date('2026-09-24T08:00:00.000Z'),
				end: new Date('2026-09-24T08:45:00.000Z'),
			}),
		).resolves.toEqual({
			minDurationMinutes: 45,
			maxDurationMinutes: 90,
		});

		await expect(
			assertScheduleDurationAllowed(db, {
				schoolId: 'school-1',
				kind: EventType.THEORY,
				start: new Date('2026-09-24T08:00:00.000Z'),
				end: new Date('2026-09-24T09:30:00.000Z'),
			}),
		).resolves.toBeDefined();
	});

	it('rejects a duration above the configured maximum', async () => {
		const db = createDb({
			practiceMinDurationMinutes: 60,
			practiceMaxDurationMinutes: 120,
			theoryMinDurationMinutes: 45,
			theoryMaxDurationMinutes: 90,
		});

		await expect(
			assertScheduleDurationAllowed(db, {
				schoolId: 'school-1',
				kind: EventType.THEORY,
				start: new Date('2026-09-24T08:00:00.000Z'),
				end: new Date('2026-09-24T09:31:00.000Z'),
			}),
		).rejects.toMatchObject({
			statusCode: 400,
			message: 'Duration must not exceed 90 minutes',
		});
	});

	it('rejects invalid dates without querying policy settings', async () => {
		const db = createDb(null);

		await expect(
			assertScheduleDurationAllowed(db, {
				schoolId: 'school-1',
				kind: 'PRACTICE',
				start: new Date('invalid'),
				end: new Date('invalid'),
			}),
		).rejects.toMatchObject({ statusCode: 400 });
	});
});
