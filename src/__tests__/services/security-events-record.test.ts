import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const db = {
		securityEvent: { create: vi.fn(), findFirst: vi.fn() },
		securityDetectionState: { upsert: vi.fn(), updateMany: vi.fn() },
		user: { findFirst: vi.fn() },
		$transaction: vi.fn(),
	};
	return { db };
});
vi.mock('../../lib/prisma', () => ({ getPrisma: () => mocks.db }));

import { recordSecurityEvent } from '../../services/security-events/record';

const schoolId = '22222222-2222-4222-8222-222222222222';
const externalId = '33333333-3333-4333-8333-333333333333';

describe('security event writer', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		delete process.env.SECURITY_EVENT_HMAC_KEY_VERSION;
		process.env.SECURITY_EVENT_HMAC_KEY =
			'unit-test-secret-with-more-than-32-characters';
		mocks.db.$transaction.mockImplementation(
			async (callback: (tx: typeof mocks.db) => Promise<unknown>) =>
				callback(mocks.db),
		);
		mocks.db.securityEvent.create.mockResolvedValue({});
		mocks.db.securityDetectionState.upsert.mockResolvedValue({});
	});

	it('uses the configured key version for the event and detection states', async () => {
		process.env.SECURITY_EVENT_HMAC_KEY_VERSION = 'v2';
		await recordSecurityEvent({
			type: 'LOGIN_FAILED',
			source: 'TEST',
			attemptId: 'rotation',
			loginIdentifier: 'test@example.com',
			schoolScopes: [{ schoolId }],
		});
		expect(
			mocks.db.securityEvent.create.mock.calls[0][0].data.hashKeyVersion,
		).toBe('v2');
		for (const [query] of mocks.db.securityDetectionState.upsert.mock
			.calls) {
			expect(query.create.keyVersion).toBe('v2');
		}
	});

	it('rewinds a processed cursor when an older attempt arrives', async () => {
		const occurredAt = new Date('2026-10-18T12:00:00Z');
		await recordSecurityEvent({
			type: 'LOGIN_FAILED',
			source: 'TEST',
			attemptId: 'late',
			targetUserId: externalId,
			occurredAt,
		});
		expect(mocks.db.securityDetectionState.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					lastProcessedAt: { gte: occurredAt },
				}),
				data: expect.objectContaining({
					lastProcessedAt: new Date(occurredAt.getTime() - 1),
					nextEligibleAt: null,
				}),
			}),
		);
	});

	it('stores an unknown login globally and queues durable account detection', async () => {
		await recordSecurityEvent({
			type: 'LOGIN_FAILED',
			source: 'BE_HTTP',
			attemptId: 'server-attempt-1',
			loginIdentifier: 'someone@example.com',
		});
		const data = mocks.db.securityEvent.create.mock.calls[0][0].data;
		expect(data.actorUserId).toBeNull();
		expect(data.schools.create).toEqual([]);
		expect(data.loginIdentifierMasked).toBe('s***@ex***');
		expect(data.loginIdentifierHash).toMatch(/^[0-9a-f]{64}$/);
		expect(mocks.db.securityDetectionState.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					rule_scopeKey_subjectKey_keyVersion:
						expect.objectContaining({
							rule: 'ACCOUNT',
							scopeKey: 'GLOBAL',
						}),
				},
			}),
		);
	});

	it('does not copy external identity or target from raw event into school projection', async () => {
		await recordSecurityEvent({
			type: 'ACCESS_DENIED',
			source: 'BE_HTTP',
			attemptId: 'server-attempt-2',
			actorUserId: externalId,
			actorRole: 'STUDENT',
			actorDisplayName: 'Osoba spoza OSK',
			targetUserId: externalId,
			targetDisplayName: 'Ukryty cel',
			schoolScopes: [{ schoolId, actorVisibility: 'EXTERNAL' }],
		});
		const projection =
			mocks.db.securityEvent.create.mock.calls[0][0].data.schools
				.create[0];
		expect(projection).toMatchObject({
			actorVisibility: 'EXTERNAL',
			actorUserId: null,
			actorDisplayName: 'Użytkownik zewnętrzny',
			actorRole: null,
			targetUserId: null,
			targetDisplayName: null,
		});
	});

	it('queues global and school detection for a verified target', async () => {
		await recordSecurityEvent({
			type: 'LOGIN_FAILED',
			source: 'BE_HTTP',
			attemptId: 'server-attempt-3',
			targetUserId: externalId,
			schoolScopes: [{ schoolId, targetUserId: externalId }],
		});
		const keys = mocks.db.securityDetectionState.upsert.mock.calls.map(
			(call) => call[0].where.rule_scopeKey_subjectKey_keyVersion,
		);
		expect(keys).toEqual(
			expect.arrayContaining([
				{
					rule: 'ACCOUNT',
					scopeKey: 'GLOBAL',
					subjectKey: `user:${externalId}`,
					keyVersion: 'user',
				},
				{
					rule: 'ACCOUNT',
					scopeKey: `school:${schoolId}:all`,
					subjectKey: `user:${externalId}`,
					keyVersion: 'user',
				},
			]),
		);
	});

	it('normalizes IPv4-mapped IPv6 before storing and detecting', async () => {
		await recordSecurityEvent({
			type: 'LOGIN_FAILED',
			source: 'BE_HTTP',
			attemptId: 'server-attempt-4',
			clientIp: '::ffff:192.0.2.10',
			ipSource: 'SOCKET',
		});
		const data = mocks.db.securityEvent.create.mock.calls[0][0].data;
		expect(data.clientIp).toBe('192.0.2.10');
		expect(mocks.db.securityDetectionState.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					rule_scopeKey_subjectKey_keyVersion: {
						rule: 'IP',
						scopeKey: 'GLOBAL',
						subjectKey: '192.0.2.10',
						keyVersion: 'ip',
					},
				},
			}),
		);
	});
});
