import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseInstructorBirthDate } from '../../lib/validation/instructorBirthDate';

describe('instructor registration birth date', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.useRealTimers();
	});
	it.each([
		'2001-02-29',
		'2026-13-01',
		'0000-01-01',
		'2026-02-30',
		'2000-01-01T00:00:00Z',
		42,
	])('rejects invalid calendar input %s', (raw) => {
		expect(() => parseInstructorBirthDate(raw)).toThrow(
			'Invalid birthDate',
		);
	});
	it('stores a leap day as midnight UTC without changing its day', () => {
		expect(parseInstructorBirthDate('2000-02-29')?.toISOString()).toBe(
			'2000-02-29T00:00:00.000Z',
		);
	});
	it('requires missing dates by default and supports the rollout option', () => {
		vi.stubEnv('INSTRUCTOR_BIRTH_DATE_REQUIRED', 'true');
		expect(() => parseInstructorBirthDate(undefined)).toThrow(
			'birthDate is required',
		);
		vi.stubEnv('INSTRUCTOR_BIRTH_DATE_REQUIRED', 'false');
		expect(parseInstructorBirthDate(undefined)).toBeNull();
		expect(() => parseInstructorBirthDate('2026-02-30')).toThrow(
			'Invalid birthDate',
		);
	});
	it('uses the Warsaw calendar day at a UTC date boundary', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-04T22:30:00Z'));
		expect(parseInstructorBirthDate('2026-10-05')?.toISOString()).toBe(
			'2026-10-05T00:00:00.000Z',
		);
		expect(() => parseInstructorBirthDate('2026-10-06')).toThrow(
			'birthDate must not be in the future',
		);
	});
});
