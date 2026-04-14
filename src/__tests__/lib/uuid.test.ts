import { describe, expect, it } from 'vitest';
import {
	parseUuidParam,
	parseUuidPathParam,
	patchStudentPkkBodySchema,
	schoolIdQuerySchema,
} from '../../lib/validation/uuid';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('parseUuidParam', () => {
	it('returns the uuid for a valid string', () => {
		expect(parseUuidParam(VALID_UUID)).toBe(VALID_UUID);
	});

	it('returns null for undefined', () => {
		expect(parseUuidParam(undefined)).toBeNull();
	});

	it('returns the uuid when Express passes a single-element array', () => {
		expect(parseUuidParam([VALID_UUID])).toBe(VALID_UUID);
	});

	it('returns null for an empty string', () => {
		expect(parseUuidParam('')).toBeNull();
	});

	it('returns invalid for a malformed uuid string', () => {
		expect(parseUuidParam('not-a-uuid')).toBe('invalid');
	});

	it('returns invalid for a non-string value', () => {
		expect(parseUuidParam(123)).toBe('invalid');
	});

	it('returns null for an empty array', () => {
		expect(parseUuidParam([])).toBeNull();
	});
});

describe('parseUuidPathParam', () => {
	it('returns the uuid for a valid string', () => {
		expect(parseUuidPathParam(VALID_UUID)).toBe(VALID_UUID);
	});

	it('returns null for undefined', () => {
		expect(parseUuidPathParam(undefined)).toBeNull();
	});

	it('returns null for a malformed uuid', () => {
		expect(parseUuidPathParam('bad')).toBeNull();
	});
});

describe('schoolIdQuerySchema (zodPreprocessQueryFirst)', () => {
	it('accepts schoolId as a plain string', () => {
		const r = schoolIdQuerySchema.safeParse({ schoolId: VALID_UUID });
		expect(r.success).toBe(true);
		if (r.success) {
			expect(r.data.schoolId).toBe(VALID_UUID);
		}
	});

	it('accepts schoolId when Express provides an array (first value)', () => {
		const r = schoolIdQuerySchema.safeParse({ schoolId: [VALID_UUID] });
		expect(r.success).toBe(true);
		if (r.success) {
			expect(r.data.schoolId).toBe(VALID_UUID);
		}
	});

	it('rejects an invalid schoolId', () => {
		const r = schoolIdQuerySchema.safeParse({ schoolId: 'not-uuid' });
		expect(r.success).toBe(false);
	});
});

describe('patchStudentPkkBodySchema', () => {
	it('accepts exactly 20 digits', () => {
		const r = patchStudentPkkBodySchema.safeParse({
			pkkNumber: '12345678901234567890',
		});
		expect(r.success).toBe(true);
	});

	it('accepts null pkkNumber', () => {
		const r = patchStudentPkkBodySchema.safeParse({ pkkNumber: null });
		expect(r.success).toBe(true);
	});

	it('rejects a pkkNumber that is too short', () => {
		const r = patchStudentPkkBodySchema.safeParse({ pkkNumber: '123' });
		expect(r.success).toBe(false);
	});

	it('rejects non-digit characters', () => {
		const r = patchStudentPkkBodySchema.safeParse({
			pkkNumber: 'abc12345678901234567',
		});
		expect(r.success).toBe(false);
	});
});
