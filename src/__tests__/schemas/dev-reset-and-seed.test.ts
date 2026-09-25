import { describe, expect, it } from 'vitest';
import { devResetAndSeedBodySchema } from '../../schemas/dev.schemas';

describe('devResetAndSeedBodySchema', () => {
	it('accepts an omitted or empty body', () => {
		expect(devResetAndSeedBodySchema.parse(undefined)).toEqual({});
		expect(devResetAndSeedBodySchema.parse({})).toEqual({});
	});

	it('accepts supported volume levels and a random seed', () => {
		expect(
			devResetAndSeedBodySchema.parse({
				schools: 'low',
				students: 'high',
				lessons: 'default',
				randomSeed: 'manual-test-01',
			}),
		).toEqual({
			schools: 'low',
			students: 'high',
			lessons: 'default',
			randomSeed: 'manual-test-01',
		});
	});

	it('rejects an unknown volume level', () => {
		expect(() =>
			devResetAndSeedBodySchema.parse({ students: 'medium' }),
		).toThrow();
	});

	it('rejects an unknown field', () => {
		expect(() =>
			devResetAndSeedBodySchema.parse({ payments: 'low' }),
		).toThrow();
	});

	it('requires randomSeed to contain between 1 and 100 characters', () => {
		expect(() =>
			devResetAndSeedBodySchema.parse({ randomSeed: '' }),
		).toThrow();
		expect(() =>
			devResetAndSeedBodySchema.parse({ randomSeed: 'x'.repeat(101) }),
		).toThrow();
	});
});
