import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveCreatedAtFilter } from '../../services/lesson-rating/dateFilters';

describe('resolveCreatedAtFilter', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('includes today and the previous six calendar days for last7days', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-09-29T12:00:00.000Z'));

		expect(resolveCreatedAtFilter({ period: 'last7days' })).toEqual({
			gte: new Date('2026-09-23T00:00:00.000Z'),
			lt: new Date('2026-09-30T00:00:00.000Z'),
		});
	});
});
