import {
	createSeedRandom,
	getSeedRange,
	resolveSeedOptions,
	type SeedOptionsInput,
	type SeedResolvedOptions,
} from './config';

export type SeedSchoolPlan = {
	instructors: number;
	students: number;
	vehicles: number;
	courses: number;
};

export type SeedPlan = {
	options: SeedResolvedOptions;
	randomSeed: string;
	schools: SeedSchoolPlan[];
};

export function createSeedPlan(input: SeedOptionsInput = {}): SeedPlan {
	const { options, randomSeed } = resolveSeedOptions(input);
	const random = createSeedRandom(`${randomSeed}:plan`);
	const schoolCount = random.integerInclusive(
		getSeedRange('schools', options.schools),
	);
	const schools = Array.from({ length: schoolCount }, () => ({
		instructors: random.integerInclusive(
			getSeedRange('instructors', options.instructors),
		),
		students: random.integerInclusive(
			getSeedRange('students', options.students),
		),
		vehicles: random.integerInclusive(
			getSeedRange('vehicles', options.vehicles),
		),
		courses: random.integerInclusive(
			getSeedRange('courses', options.courses),
		),
	}));

	return { options, randomSeed, schools };
}
