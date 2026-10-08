import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	issueAuditConfirmation,
	requireAuditExecutionEnabled,
	requireAuditPreviewEnabled,
	verifyAuditConfirmation,
} from '../../services/auditResetGuard';

const tracked = [
	'NODE_ENV',
	'DATABASE_URL',
	'ALLOW_DB_RESET',
	'ALLOW_DB_FULL_RESET',
	'AUDIT_RESET_TARGET_FINGERPRINT',
	'AUDIT_RESET_CONFIRM_SECRET',
] as const;
const previous = Object.fromEntries(
	tracked.map((key) => [key, process.env[key]]),
);

beforeEach(() => {
	process.env.NODE_ENV = 'test';
	process.env.DATABASE_URL =
		'postgresql://user:password@localhost:5432/audit_db';
	process.env.ALLOW_DB_RESET = 'true';
	process.env.AUDIT_RESET_CONFIRM_SECRET = 'a'.repeat(40);
});

afterEach(() => {
	for (const key of tracked) {
		const value = previous[key];
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
});

describe('audit reset guard', () => {
	it('requires explicit target approval and separate full reset gate', () => {
		const target = requireAuditPreviewEnabled();
		expect(() =>
			requireAuditExecutionEnabled({ kind: 'clear', level: 'managers' }),
		).toThrow('Audit database target is not approved');
		process.env.AUDIT_RESET_TARGET_FINGERPRINT = target;
		expect(
			requireAuditExecutionEnabled({ kind: 'clear', level: 'managers' }),
		).toBe(target);
		expect(() =>
			requireAuditExecutionEnabled({ kind: 'clear', level: 'full' }),
		).toThrow('Full database reset is disabled');
		process.env.ALLOW_DB_FULL_RESET = 'true';
		expect(
			requireAuditExecutionEnabled({ kind: 'clear', level: 'full' }),
		).toBe(target);
	});

	it('rejects production even when all reset flags are enabled', () => {
		process.env.NODE_ENV = 'production';
		expect(() => requireAuditPreviewEnabled()).toThrow(
			'Audit reset is unavailable in production',
		);
	});

	it('binds confirmation to operation, target, preview and expiry', () => {
		const target = requireAuditPreviewEnabled();
		const operation = { kind: 'clear' as const, level: 'schools' as const };
		const preview = { before: { users: 3 }, retained: { users: 2 } };
		const { confirmation } = issueAuditConfirmation(
			operation,
			target,
			preview,
			1_000,
		);
		expect(() =>
			verifyAuditConfirmation(
				confirmation,
				operation,
				target,
				preview,
				2_000,
			),
		).not.toThrow();
		expect(() =>
			verifyAuditConfirmation(
				confirmation,
				operation,
				target,
				{ before: { users: 4 } },
				2_000,
			),
		).toThrow('Audit preview has expired or data changed');
		expect(() =>
			verifyAuditConfirmation(
				confirmation,
				operation,
				target,
				preview,
				700_000,
			),
		).toThrow('Audit preview has expired or data changed');
	});
});
