import { describe, expect, it } from 'vitest';
import { instructorAdminPatchBodySchema } from '../../lib/validation/instructorAdminPatch';

describe('instructorAdminPatchBodySchema — valid payloads', () => {
	it('accepts firstName and trims it', () => {
		const r = instructorAdminPatchBodySchema.safeParse({
			firstName: '  Jan  ',
		});
		expect(r.success).toBe(true);
		if (r.success) {
			expect(r.data.firstName).toBe('Jan');
		}
	});

	it('accepts experienceYears at bounds 0 and 80', () => {
		expect(
			instructorAdminPatchBodySchema.safeParse({ experienceYears: 0 })
				.success,
		).toBe(true);
		expect(
			instructorAdminPatchBodySchema.safeParse({ experienceYears: 80 })
				.success,
		).toBe(true);
	});

	it('accepts an empty object (all fields optional)', () => {
		expect(instructorAdminPatchBodySchema.safeParse({}).success).toBe(true);
	});

	it('strips unknown keys', () => {
		const r = instructorAdminPatchBodySchema.safeParse({
			firstName: 'Jan',
			extraField: 'remove-me',
		} as Record<string, unknown>);
		expect(r.success).toBe(true);
		if (r.success) {
			expect(r.data).not.toHaveProperty('extraField');
			expect(r.data.firstName).toBe('Jan');
		}
	});
});

describe('instructorAdminPatchBodySchema — invalid payloads', () => {
	it('rejects empty firstName', () => {
		expect(
			instructorAdminPatchBodySchema.safeParse({ firstName: '' }).success,
		).toBe(false);
	});

	it('rejects whitespace-only firstName after trim', () => {
		expect(
			instructorAdminPatchBodySchema.safeParse({ firstName: '   ' })
				.success,
		).toBe(false);
	});

	it('rejects experienceYears below 0', () => {
		expect(
			instructorAdminPatchBodySchema.safeParse({ experienceYears: -1 })
				.success,
		).toBe(false);
	});

	it('rejects experienceYears above 80', () => {
		expect(
			instructorAdminPatchBodySchema.safeParse({ experienceYears: 81 })
				.success,
		).toBe(false);
	});

	it('rejects non-integer experienceYears', () => {
		expect(
			instructorAdminPatchBodySchema.safeParse({ experienceYears: 1.5 })
				.success,
		).toBe(false);
	});

	it('rejects string experienceYears', () => {
		expect(
			instructorAdminPatchBodySchema.safeParse({
				experienceYears: 'abc' as unknown as number,
			}).success,
		).toBe(false);
	});
});
