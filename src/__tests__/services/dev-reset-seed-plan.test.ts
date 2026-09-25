import { Role } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { buildSeedUsers } from '../../services/devResetSeed/authUsers';
import { SEED_VOLUME_RANGES } from '../../services/devResetSeed/config';
import { createSeedPlan } from '../../services/devResetSeed/seedPlan';

function expectInRange(value: number, range: readonly [number, number]) {
	expect(value).toBeGreaterThanOrEqual(range[0]);
	expect(value).toBeLessThanOrEqual(range[1]);
}

describe('createSeedPlan', () => {
	it('uses one school by default and default ranges for its resources', () => {
		const plan = createSeedPlan({ randomSeed: 'default-plan' });

		expect(plan.schools).toHaveLength(1);
		expect(plan.options.schools).toBe('low');
		expect(plan.options.students).toBe('default');
		expectInRange(
			plan.schools[0]!.instructors,
			SEED_VOLUME_RANGES.instructors.default,
		);
		expectInRange(
			plan.schools[0]!.students,
			SEED_VOLUME_RANGES.students.default,
		);
		expectInRange(
			plan.schools[0]!.vehicles,
			SEED_VOLUME_RANGES.vehicles.default,
		);
		expectInRange(
			plan.schools[0]!.courses,
			SEED_VOLUME_RANGES.courses.default,
		);
	});

	it('replays the same plan for the same configuration and random seed', () => {
		const input = {
			schools: 'high',
			students: 'low',
			randomSeed: 'repeatable-plan',
		} as const;

		expect(createSeedPlan(input)).toEqual(createSeedPlan(input));
	});

	it('creates exactly as many role users as requested by the plan', () => {
		const plan = createSeedPlan({
			schools: 'default',
			instructors: 'low',
			students: 'low',
			randomSeed: 'user-counts',
		});
		const users = buildSeedUsers(plan);
		const expectedInstructors = plan.schools.reduce(
			(sum, school) => sum + school.instructors,
			0,
		);
		const expectedStudents = plan.schools.reduce(
			(sum, school) => sum + school.students,
			0,
		);

		expect(users.filter((user) => user.role === Role.MANAGER)).toHaveLength(
			plan.schools.length,
		);
		expect(
			users.filter((user) => user.role === Role.INSTRUCTOR),
		).toHaveLength(expectedInstructors);
		expect(users.filter((user) => user.role === Role.STUDENT)).toHaveLength(
			expectedStudents,
		);
	});
});
