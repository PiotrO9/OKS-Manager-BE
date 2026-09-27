import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertLessonDateInsideBookingWindow } from '../../services/lesson/bookingRules';

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock('../../lib/prisma', () => ({
	getPrisma: () => ({ schoolSettings: { findUnique } }),
}));

afterEach(() => {
	vi.useRealTimers();
	vi.resetAllMocks();
});

describe('lesson school working days', () => {
	it('rejects a weekend closed by this school even if an instructor is available', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-09-27T09:00:00.000Z'));
		findUnique.mockResolvedValue({
			bookingMaxDaysAhead: 30,
			workingDaysMask: 62,
		});

		await expect(
			assertLessonDateInsideBookingWindow(
				new Date('2026-10-03T08:00:00.000Z'),
				'school-1',
			),
		).rejects.toThrow('Driving school is closed on this day');
	});

	it('allows Saturday when the school has enabled it', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-09-27T09:00:00.000Z'));
		findUnique.mockResolvedValue({
			bookingMaxDaysAhead: 30,
			workingDaysMask: 126,
		});

		await expect(
			assertLessonDateInsideBookingWindow(
				new Date('2026-10-03T08:00:00.000Z'),
				'school-1',
			),
		).resolves.toBeUndefined();
	});
});
