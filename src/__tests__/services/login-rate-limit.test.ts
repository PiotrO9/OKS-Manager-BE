import type { Request } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	checkLoginRateLimit,
	LoginLimitExceeded,
	reserveLoginAttempt,
} from '../../services/loginRateLimit';

const database = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock('../../lib/prisma', () => ({
	getPrisma: () => ({ $transaction: database.transaction }),
}));

const request = {
	socket: { remoteAddress: '127.0.0.1' },
	headers: {},
} as Request;

describe('login attempt budgets', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.clearAllMocks();
	});
	function enable() {
		vi.stubEnv('LOGIN_RATE_LIMIT_ENABLED', 'true');
		vi.stubEnv('LOGIN_RATE_LIMIT_HMAC_KEY', 's'.repeat(32));
		vi.stubEnv('LOGIN_RATE_LIMIT_DIRECT_CLIENT_SOCKET', 'false');
	}
	it('does not access storage before rollout is enabled', async () => {
		vi.stubEnv('LOGIN_RATE_LIMIT_ENABLED', 'false');
		const reserve = vi.fn();
		await checkLoginRateLimit(request, 'test@example.com', reserve);
		expect(reserve).not.toHaveBeenCalled();
	});
	it('normalizes account keys and keeps raw identifiers out of storage', async () => {
		enable();
		const reserve = vi.fn().mockResolvedValue(undefined);
		await checkLoginRateLimit(request, ' Test@EXAMPLE.com ', reserve);
		await checkLoginRateLimit(request, 'test@example.com', reserve);
		expect(reserve.mock.calls[0]).toEqual(reserve.mock.calls[1]);
		expect(reserve.mock.calls[0][0][0]).toEqual({
			key: expect.stringMatching(/^[a-f0-9]{64}$/),
			limit: 5,
		});
		expect(JSON.stringify(reserve.mock.calls)).not.toContain('example.com');
	});
	it('uses independent account and socket budgets and ignores spoofed forwarding', async () => {
		enable();
		vi.stubEnv('LOGIN_RATE_LIMIT_DIRECT_CLIENT_SOCKET', 'true');
		const reserve = vi.fn().mockResolvedValue(undefined);
		await checkLoginRateLimit(request, 'a@example.com', reserve);
		await checkLoginRateLimit(
			{
				...request,
				headers: { 'x-forwarded-for': '203.0.113.1' },
			} as unknown as Request,
			'b@example.com',
			reserve,
		);
		const [first, second] = reserve.mock.calls;
		expect(first[0][0].key).not.toEqual(second[0][0].key);
		expect(first[0][1]).toEqual(second[0][1]);
		expect(first[0][1].limit).toBe(20);
	});
	it('fails closed if enabled without a valid secret', async () => {
		enable();
		vi.stubEnv('LOGIN_RATE_LIMIT_HMAC_KEY', 'short');
		const reserve = vi.fn();
		await expect(
			checkLoginRateLimit(request, 'a@example.com', reserve),
		).rejects.toThrow('key missing');
		expect(reserve).not.toHaveBeenCalled();
	});
	it('propagates exhausted budgets without treating them as provider errors', async () => {
		enable();
		await expect(
			checkLoginRateLimit(
				request,
				'a@example.com',
				vi.fn().mockRejectedValue(new LoginLimitExceeded()),
			),
		).rejects.toBeInstanceOf(LoginLimitExceeded);
	});
	it('locks in stable order and aborts the transaction on an exhausted bucket', async () => {
		const query = vi
			.fn()
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([]);
		database.transaction.mockImplementation(async (fn) =>
			fn({ $queryRaw: query }),
		);
		await expect(
			reserveLoginAttempt(
				[
					{ key: 'z', limit: 20 },
					{ key: 'a', limit: 5 },
				],
				60_000,
			),
		).rejects.toBeInstanceOf(LoginLimitExceeded);
		expect(query.mock.calls[0][1]).toBe('a');
		expect(query).toHaveBeenCalledTimes(2);
		expect(database.transaction).toHaveBeenCalledWith(
			expect.any(Function),
			{ maxWait: 500, timeout: 1500 },
		);
	});
});
