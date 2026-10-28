import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { getPrisma } from '../../lib/prisma';
import {
	LoginLimitExceeded,
	reserveLoginAttempt,
} from '../../services/loginRateLimit';

const db = getPrisma();
const keys: string[] = [];
function key(prefix = '') {
	const value = `${prefix}${randomUUID()}`;
	keys.push(value);
	return value;
}

describe('login attempt budgets with PostgreSQL', () => {
	afterEach(async () => {
		await db.loginRateLimitBucket.deleteMany({
			where: { key: { in: keys } },
		});
		keys.length = 0;
	});
	afterAll(() => db.$disconnect());

	it('allows exactly five of twelve concurrent attempts', async () => {
		const accountKey = key();
		const results = await Promise.allSettled(
			Array.from({ length: 12 }, () =>
				reserveLoginAttempt([{ key: accountKey, limit: 5 }], 60_000),
			),
		);
		expect(
			results.filter((result) => result.status === 'fulfilled'),
		).toHaveLength(5);
		const rejected = results.filter(
			(result) => result.status === 'rejected',
		);
		expect(rejected).toHaveLength(7);
		for (const result of rejected)
			expect(result.reason).toBeInstanceOf(LoginLimitExceeded);
		expect(
			await db.loginRateLimitBucket.findUnique({
				where: { key: accountKey },
			}),
		).toMatchObject({ attempts: 5 });
	});

	it('rolls back the first budget when the second budget is exhausted', async () => {
		const firstKey = key('a-');
		const secondKey = key('z-');
		await reserveLoginAttempt([{ key: secondKey, limit: 1 }], 60_000);
		await expect(
			reserveLoginAttempt(
				[
					{ key: firstKey, limit: 20 },
					{ key: secondKey, limit: 1 },
				],
				60_000,
			),
		).rejects.toBeInstanceOf(LoginLimitExceeded);
		expect(
			await db.loginRateLimitBucket.findUnique({
				where: { key: firstKey },
			}),
		).toBeNull();
		expect(
			await db.loginRateLimitBucket.findUnique({
				where: { key: secondKey },
			}),
		).toMatchObject({ attempts: 1 });
	});

	it('rejects an exhausted live window and resets an expired window', async () => {
		const accountKey = key();
		await reserveLoginAttempt([{ key: accountKey, limit: 1 }], 60_000);
		await expect(
			reserveLoginAttempt([{ key: accountKey, limit: 1 }], 60_000),
		).rejects.toBeInstanceOf(LoginLimitExceeded);
		await db.loginRateLimitBucket.update({
			where: { key: accountKey },
			data: { expiresAt: new Date(0) },
		});
		await reserveLoginAttempt([{ key: accountKey, limit: 1 }], 60_000);
		const bucket = await db.loginRateLimitBucket.findUniqueOrThrow({
			where: { key: accountKey },
		});
		expect(bucket.attempts).toBe(1);
		expect(bucket.expiresAt.getTime()).toBeGreaterThan(Date.now());
	});

	it('keeps unrelated account budgets independent', async () => {
		const firstKey = key();
		const secondKey = key();
		await reserveLoginAttempt([{ key: firstKey, limit: 1 }], 60_000);
		await expect(
			reserveLoginAttempt([{ key: firstKey, limit: 1 }], 60_000),
		).rejects.toBeInstanceOf(LoginLimitExceeded);
		await expect(
			reserveLoginAttempt([{ key: secondKey, limit: 1 }], 60_000),
		).resolves.toBeUndefined();
	});
});
