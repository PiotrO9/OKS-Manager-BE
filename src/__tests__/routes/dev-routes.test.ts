import { describe, expect, it, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { AppError } from '../../lib/http/AppError';
import {
	parseAuditExecuteBody,
	parseAuditPreviewBody,
	parseResetAndSeedBody,
	requireLegacySeedConfirmation,
	requireResetAndSeedEnabled,
} from '../../routes/dev.routes';

describe('requireResetAndSeedEnabled', () => {
	const originalAllowDbReset = process.env.ALLOW_DB_RESET;
	const originalFullReset = process.env.ALLOW_DB_FULL_RESET;
	const originalTarget = process.env.AUDIT_RESET_TARGET_FINGERPRINT;
	const originalSecret = process.env.AUDIT_RESET_CONFIRM_SECRET;
	const originalUrl = process.env.DATABASE_URL;
	const originalNodeEnv = process.env.NODE_ENV;

	afterEach(() => {
		if (originalAllowDbReset === undefined) {
			delete process.env.ALLOW_DB_RESET;
		} else {
			process.env.ALLOW_DB_RESET = originalAllowDbReset;
		}
		for (const [key, value] of [
			['ALLOW_DB_FULL_RESET', originalFullReset],
			['AUDIT_RESET_TARGET_FINGERPRINT', originalTarget],
			['AUDIT_RESET_CONFIRM_SECRET', originalSecret],
			['DATABASE_URL', originalUrl],
			['NODE_ENV', originalNodeEnv],
		] as const) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});

	it('allows reset only with full gate and approved target', () => {
		process.env.ALLOW_DB_RESET = 'true';
		process.env.ALLOW_DB_FULL_RESET = 'true';
		process.env.AUDIT_RESET_CONFIRM_SECRET = 'a'.repeat(40);
		process.env.DATABASE_URL =
			'postgresql://user:pass@localhost:5432/audit';
		process.env.NODE_ENV = 'test';
		const target = createHash('sha256')
			.update('localhost|5432|user|/audit|public')
			.digest('hex');
		process.env.AUDIT_RESET_TARGET_FINGERPRINT = target;

		expect(() => requireResetAndSeedEnabled()).not.toThrow();
		expect(() =>
			requireLegacySeedConfirmation('WIPE AUDIT DATABASE'),
		).not.toThrow();
	});

	it('rejects reset when ALLOW_DB_RESET is not true', () => {
		process.env.ALLOW_DB_RESET = 'false';

		expect(() => requireResetAndSeedEnabled()).toThrow(AppError);
		expect(() => requireResetAndSeedEnabled()).toThrow(
			'Database reset is disabled',
		);
	});

	it('rejects missing legacy seed confirmation', () => {
		expect(() => requireLegacySeedConfirmation(undefined)).toThrow(
			'Full replacement confirmation is required',
		);
	});
});

describe('audit request validation', () => {
	it('requires an explicit operation and confirmation', () => {
		expect(() => parseAuditPreviewBody({})).toThrow(AppError);
		expect(() =>
			parseAuditExecuteBody({
				operation: { kind: 'clear', level: 'managers' },
			}),
		).toThrow(AppError);
		expect(() =>
			parseAuditPreviewBody({
				operation: { kind: 'clear', level: 'unknown' },
			}),
		).toThrow(AppError);
	});

	it('accepts a named fixture without silently defaulting to full reset', () => {
		expect(
			parseAuditPreviewBody({
				operation: { kind: 'fixture', fixture: 'school-staffed' },
			}),
		).toEqual({
			operation: { kind: 'fixture', fixture: 'school-staffed' },
		});
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
