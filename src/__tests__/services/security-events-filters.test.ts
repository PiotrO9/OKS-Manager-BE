import { describe, expect, it } from 'vitest';
import { filterConditions } from '../../services/security-events/listFilters';

describe('security log date filters', () => {
	it('includes the whole last Warsaw day in a range', () => {
		expect(
			filterConditions({
				rules: [
					{
						field: 'occurredAt',
						operator: 'between',
						value: { from: '2026-03-28', to: '2026-03-29' },
					},
				],
			}),
		).toEqual([
			{
				occurredAt: {
					gte: new Date('2026-03-27T23:00:00Z'),
					lt: new Date('2026-03-29T22:00:00Z'),
				},
			},
		]);
	});
	it.each(['2026-02-30', 'not-a-date'])(
		'rejects invalid calendar date %s',
		(value) => {
			expect(() =>
				filterConditions({
					rules: [{ field: 'occurredAt', operator: 'on', value }],
				}),
			).toThrow();
		},
	);
	it('preserves exclusive before and following-day after boundaries', () => {
		expect(
			filterConditions({
				rules: [
					{
						field: 'occurredAt',
						operator: 'before',
						value: '2026-10-25',
					},
					{
						field: 'occurredAt',
						operator: 'after',
						value: '2026-10-25',
					},
				],
			}),
		).toEqual([
			{ occurredAt: { lt: new Date('2026-10-24T22:00:00Z') } },
			{ occurredAt: { gte: new Date('2026-10-25T23:00:00Z') } },
		]);
	});
});
