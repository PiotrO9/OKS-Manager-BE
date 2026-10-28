import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	db: { $queryRaw: vi.fn(), $executeRaw: vi.fn(), $transaction: vi.fn() },
}));
vi.mock('../../lib/prisma', () => ({ getPrisma: () => mocks.db }));

describe('shared security collection status', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		vi.stubEnv('SECURITY_EVENTS_DETECTION_ENABLED', 'true');
		for (const key of [
			'SECURITY_EVENT_HMAC_KEY',
			'SECURITY_LOG_CURSOR_SECRET',
			'SECURITY_LOGS_BFF_SHARED_SECRET',
		])
			vi.stubEnv(key, 'test-secret-with-at-least-thirty-two-characters');
		mocks.db.$executeRaw.mockResolvedValue(1);
		mocks.db.$transaction.mockImplementation(async (callback) =>
			callback(mocks.db),
		);
	});
	afterEach(() => vi.unstubAllEnvs());
	it('does not mistake a quiet event log for a dead worker', async () => {
		mocks.db.$queryRaw
			.mockResolvedValueOnce([
				{
					component: 'DETECTOR',
					last_success_at: new Date(),
					last_failure_at: null,
				},
			])
			.mockResolvedValueOnce([{ delayed: false }]);
		const { getSecurityCollectionStatus } =
			await import('../../services/security-events/health');
		expect(await getSecurityCollectionStatus()).toBe('OK');
	});
	it('reports a stopped worker as degraded', async () => {
		mocks.db.$queryRaw.mockResolvedValue([
			{
				component: 'DETECTOR',
				last_success_at: new Date(Date.now() - 31_000),
				last_failure_at: null,
			},
		]);
		const { getSecurityCollectionStatus } =
			await import('../../services/security-events/health');
		expect(await getSecurityCollectionStatus()).toBe('DEGRADED');
	});
	it('retains recent writer failures even when another process is healthy', async () => {
		mocks.db.$queryRaw.mockResolvedValue([
			{
				component: 'DETECTOR',
				last_success_at: new Date(),
				last_failure_at: null,
			},
			{
				component: 'WRITER',
				last_success_at: new Date(),
				last_failure_at: new Date(),
			},
		]);
		const { getSecurityCollectionStatus } =
			await import('../../services/security-events/health');
		expect(await getSecurityCollectionStatus()).toBe('DEGRADED');
	});
	it('reports a pending old queue as degraded', async () => {
		mocks.db.$queryRaw
			.mockResolvedValueOnce([
				{
					component: 'DETECTOR',
					last_success_at: new Date(),
					last_failure_at: null,
				},
			])
			.mockResolvedValueOnce([{ delayed: true }]);
		const { getSecurityCollectionStatus } =
			await import('../../services/security-events/health');
		expect(await getSecurityCollectionStatus()).toBe('DEGRADED');
	});
	it('returns unknown when shared health cannot be read', async () => {
		mocks.db.$queryRaw.mockRejectedValue(new Error('offline'));
		const { getSecurityCollectionStatus } =
			await import('../../services/security-events/health');
		expect(await getSecurityCollectionStatus()).toBe('UNKNOWN');
	});
	it('reports disabled detection and missing configuration as degraded', async () => {
		const { getSecurityCollectionStatus } =
			await import('../../services/security-events/health');
		vi.stubEnv('SECURITY_EVENTS_DETECTION_ENABLED', 'false');
		expect(await getSecurityCollectionStatus()).toBe('DEGRADED');
		vi.stubEnv('SECURITY_EVENTS_DETECTION_ENABLED', 'true');
		vi.stubEnv('SECURITY_EVENT_HMAC_KEY', '');
		expect(await getSecurityCollectionStatus()).toBe('DEGRADED');
	});
	it('keeps a failed health write until the DB recovers without throwing', async () => {
		mocks.db.$executeRaw.mockRejectedValueOnce(new Error('offline'));
		const { reportSecurityHealth } =
			await import('../../services/security-events/health');
		await reportSecurityHealth('WRITER', false);
		await reportSecurityHealth('WRITER', true);
		expect(mocks.db.$executeRaw).toHaveBeenCalledTimes(2);
		const values = mocks.db.$executeRaw.mock.calls[1];
		expect(values[3]).toBeInstanceOf(Date);
	});
});
