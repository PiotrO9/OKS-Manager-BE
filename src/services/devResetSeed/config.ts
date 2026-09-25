import { randomUUID } from 'node:crypto';

export type SeedVolume = 'low' | 'default' | 'high';

export type SeedOptionsInput = {
	schools?: SeedVolume;
	instructors?: SeedVolume;
	students?: SeedVolume;
	vehicles?: SeedVolume;
	courses?: SeedVolume;
	courseParticipants?: SeedVolume;
	lessons?: SeedVolume;
	events?: SeedVolume;
	timeBlocks?: SeedVolume;
	randomSeed?: string;
};

export type SeedResource = Exclude<keyof SeedOptionsInput, 'randomSeed'>;
export type SeedRange = readonly [min: number, max: number];
export type SeedResolvedOptions = Required<
	Omit<SeedOptionsInput, 'randomSeed'>
>;

type SeedVolumeRanges = Record<SeedVolume, SeedRange>;

export const SEED_VOLUME_RANGES: Record<SeedResource, SeedVolumeRanges> = {
	schools: {
		low: [1, 1],
		default: [3, 4],
		high: [5, 6],
	},
	instructors: {
		low: [2, 3],
		default: [3, 5],
		high: [6, 9],
	},
	students: {
		low: [10, 18],
		default: [18, 30],
		high: [35, 55],
	},
	vehicles: {
		low: [2, 3],
		default: [4, 6],
		high: [7, 10],
	},
	courses: {
		low: [4, 6],
		default: [7, 10],
		high: [15, 22],
	},
	courseParticipants: {
		low: [4, 7],
		default: [7, 12],
		high: [12, 18],
	},
	lessons: {
		low: [6, 12],
		default: [20, 32],
		high: [36, 52],
	},
	events: {
		low: [1, 2],
		default: [3, 5],
		high: [6, 8],
	},
	timeBlocks: {
		low: [0, 2],
		default: [2, 5],
		high: [5, 8],
	},
};

const DEFAULT_LEVELS: SeedResolvedOptions = {
	schools: 'low',
	instructors: 'default',
	students: 'default',
	vehicles: 'default',
	courses: 'default',
	courseParticipants: 'default',
	lessons: 'default',
	events: 'default',
	timeBlocks: 'default',
};

function hashSeed(seed: string): number {
	let hash = 2166136261;
	for (let index = 0; index < seed.length; index += 1) {
		hash ^= seed.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}

	return hash >>> 0;
}

export type SeedRandom = {
	integerInclusive(range: SeedRange): number;
	pick<T>(values: readonly T[]): T;
	chance(probability: number): boolean;
};

class DeterministicSeedRandom implements SeedRandom {
	private state: number;

	constructor(seed: string) {
		this.state = hashSeed(seed);
	}

	private next(): number {
		this.state = (this.state + 0x6d2b79f5) >>> 0;
		let value = this.state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	}

	integerInclusive(range: SeedRange): number {
		const [min, max] = range;
		if (
			!Number.isSafeInteger(min) ||
			!Number.isSafeInteger(max) ||
			min > max
		) {
			throw new Error(`Invalid seed range: ${min}-${max}`);
		}

		return min + Math.floor(this.next() * (max - min + 1));
	}

	pick<T>(values: readonly T[]): T {
		if (values.length === 0) {
			throw new Error('Cannot pick from an empty collection');
		}

		return values[this.integerInclusive([0, values.length - 1])] as T;
	}

	chance(probability: number): boolean {
		if (probability < 0 || probability > 1) {
			throw new Error('Seed probability must be between 0 and 1');
		}

		return this.next() < probability;
	}
}

export function createSeedRandom(seed: string): SeedRandom {
	return new DeterministicSeedRandom(seed);
}

export function getSeedRange(
	resource: SeedResource,
	volume: SeedVolume,
): SeedRange {
	return SEED_VOLUME_RANGES[resource][volume];
}

export type ResolvedSeedOptions = {
	options: SeedResolvedOptions;
	randomSeed: string;
};

export function resolveSeedOptions(
	input: SeedOptionsInput = {},
): ResolvedSeedOptions {
	const options = { ...DEFAULT_LEVELS };
	for (const resource of Object.keys(DEFAULT_LEVELS) as SeedResource[]) {
		if (input[resource] !== undefined) {
			options[resource] = input[resource];
		}
	}
	const randomSeed = input.randomSeed || randomUUID();

	return { options, randomSeed };
}
