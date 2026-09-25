import { describe, expect, it } from 'vitest';
import {
	SEED_VOLUME_RANGES,
	createSeedRandom,
	getSeedRange,
	resolveSeedOptions,
	type SeedRandom,
	type SeedResource,
	type SeedVolume,
} from '../../services/devResetSeed/config';

const resources: SeedResource[] = [
	'schools',
	'instructors',
	'students',
	'vehicles',
	'courses',
	'courseParticipants',
	'lessons',
	'events',
	'timeBlocks',
];
const volumes: SeedVolume[] = ['low', 'default', 'high'];

describe('dev reset seed configuration', () => {
	it('exposes the agreed boundaries for every preset', () => {
		expect(SEED_VOLUME_RANGES).toEqual({
			schools: { low: [1, 1], default: [3, 4], high: [5, 6] },
			instructors: { low: [2, 3], default: [3, 5], high: [6, 9] },
			students: { low: [10, 18], default: [18, 30], high: [35, 55] },
			vehicles: { low: [2, 3], default: [4, 6], high: [7, 10] },
			courses: { low: [4, 6], default: [7, 10], high: [15, 22] },
			courseParticipants: {
				low: [4, 7],
				default: [7, 12],
				high: [12, 18],
			},
			lessons: { low: [6, 12], default: [20, 32], high: [36, 52] },
			events: { low: [1, 2], default: [3, 5], high: [6, 8] },
			timeBlocks: { low: [0, 2], default: [2, 5], high: [5, 8] },
		});
	});

	it('uses low for schools and default for every other resource', () => {
		const resolved = resolveSeedOptions({ randomSeed: 'defaults' });

		expect(resolved).toEqual({
			randomSeed: 'defaults',
			options: {
				schools: 'low',
				instructors: 'default',
				students: 'default',
				vehicles: 'default',
				courses: 'default',
				courseParticipants: 'default',
				lessons: 'default',
				events: 'default',
				timeBlocks: 'default',
			},
		});
	});

	it('always resolves schools low to exactly one school', () => {
		const resolved = resolveSeedOptions({
			schools: 'low',
			randomSeed: 'one-school',
		});
		const random = createSeedRandom(resolved.randomSeed);

		expect(getSeedRange('schools', resolved.options.schools)).toEqual([
			1, 1,
		]);
		expect(
			random.integerInclusive(
				getSeedRange('schools', resolved.options.schools),
			),
		).toBe(1);
	});

	it('defines valid inclusive boundaries for every resource and preset', () => {
		for (const resource of resources) {
			for (const volume of volumes) {
				const range = SEED_VOLUME_RANGES[resource][volume];
				const random = createSeedRandom(`${resource}-${volume}`);

				expect(range[0]).toBeLessThanOrEqual(range[1]);
				for (let sample = 0; sample < 100; sample += 1) {
					expect(
						random.integerInclusive(range),
					).toBeGreaterThanOrEqual(range[0]);
					expect(random.integerInclusive(range)).toBeLessThanOrEqual(
						range[1],
					);
				}
			}
		}
	});

	it('produces the same sequence for the same random seed', () => {
		const first = createSeedRandom('repeatable-seed');
		const second = createSeedRandom('repeatable-seed');
		const sequence = (random: SeedRandom) =>
			Array.from({ length: 12 }, () =>
				random.integerInclusive([0, 1000]),
			);

		expect(sequence(first)).toEqual(sequence(second));
	});

	it('produces different sequences for different random seeds', () => {
		const first = createSeedRandom('seed-a');
		const second = createSeedRandom('seed-b');
		const sequence = (random: SeedRandom) =>
			Array.from({ length: 12 }, () =>
				random.integerInclusive([0, 1000]),
			);

		expect(sequence(first)).not.toEqual(sequence(second));
	});

	it('generates and returns a seed when none is supplied', () => {
		const first = resolveSeedOptions();
		const second = resolveSeedOptions();

		expect(first.randomSeed).toBeTruthy();
		expect(second.randomSeed).toBeTruthy();
		expect(first.randomSeed).not.toBe(second.randomSeed);
	});
});
