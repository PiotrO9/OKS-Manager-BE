import { describe, expect, it, afterEach } from 'vitest';
import { AppError } from '../../lib/http/AppError';
import {
	parseResetAndSeedBody,
	requireResetAndSeedEnabled,
} from '../../routes/dev.routes';

describe('requireResetAndSeedEnabled', () => {
	const originalAllowDbReset = process.env.ALLOW_DB_RESET;

	afterEach(() => {
		if (originalAllowDbReset === undefined) {
			delete process.env.ALLOW_DB_RESET;
		} else {
			process.env.ALLOW_DB_RESET = originalAllowDbReset;
		}
	});

	it('allows reset when ALLOW_DB_RESET is true', () => {
		process.env.ALLOW_DB_RESET = 'true';

		expect(() => requireResetAndSeedEnabled()).not.toThrow();
	});

	it('rejects reset when ALLOW_DB_RESET is not true', () => {
		process.env.ALLOW_DB_RESET = 'false';

		expect(() => requireResetAndSeedEnabled()).toThrow(AppError);
		expect(() => requireResetAndSeedEnabled()).toThrow(
			'Database reset is disabled',
		);
	});
});

describe('parseResetAndSeedBody', () => {
	it('normalizes a missing body to an empty configuration', () => {
		expect(parseResetAndSeedBody(undefined)).toEqual({});
	});

	it('returns validated seed options', () => {
		expect(
			parseResetAndSeedBody({ students: 'low', lessons: 'high' }),
		).toEqual({ students: 'low', lessons: 'high' });
	});

	it('maps an invalid body to a bad request error', () => {
		expect(() => parseResetAndSeedBody({ students: 'medium' })).toThrow(
			AppError,
		);
		expect(() => parseResetAndSeedBody({ unknown: 'low' })).toThrow(
			AppError,
		);
	});
});
