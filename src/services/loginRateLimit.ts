import { createHmac } from 'crypto';
import type { Request } from 'express';
import { getPrisma } from '../lib/prisma';

export class LoginLimitExceeded extends Error {}

export interface LoginBucket {
	key: string;
	limit: number;
}

// A transaction reserves both independent budgets or neither. Stable lock order
// serializes concurrent requests across API instances without a process-local map.
export async function reserveLoginAttempt(
	buckets: LoginBucket[],
	windowMs: number,
) {
	await getPrisma().$transaction(
		async (tx) => {
			for (const bucket of [...buckets].sort((a, b) =>
				a.key.localeCompare(b.key),
			)) {
				await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${bucket.key}, 0))::text`;
				const rows = await tx.$queryRaw<{ attempts: number }[]>`
					INSERT INTO login_rate_limit_buckets (key, attempts, expires_at)
					VALUES (${bucket.key}, 1, CURRENT_TIMESTAMP + ${windowMs} * INTERVAL '1 millisecond')
					ON CONFLICT (key) DO UPDATE SET
						attempts = CASE WHEN login_rate_limit_buckets.expires_at <= CURRENT_TIMESTAMP
							THEN 1 ELSE login_rate_limit_buckets.attempts + 1 END,
						expires_at = CASE WHEN login_rate_limit_buckets.expires_at <= CURRENT_TIMESTAMP
							THEN EXCLUDED.expires_at ELSE login_rate_limit_buckets.expires_at END
					WHERE login_rate_limit_buckets.expires_at <= CURRENT_TIMESTAMP
						OR login_rate_limit_buckets.attempts < ${bucket.limit}
					RETURNING attempts`;
				if (rows.length === 0) throw new LoginLimitExceeded();
			}
		},
		{ maxWait: 500, timeout: 1500 },
	);
}

export async function checkLoginRateLimit(
	req: Request,
	email: string,
	reserve = reserveLoginAttempt,
) {
	if (process.env.LOGIN_RATE_LIMIT_ENABLED !== 'true') return;
	const secret = process.env.LOGIN_RATE_LIMIT_HMAC_KEY;
	if (!secret || secret.length < 32)
		throw new Error('Login limiter key missing');
	const hash = (kind: string, value: string) =>
		createHmac('sha256', secret).update(`${kind}:${value}`).digest('hex');
	const buckets: LoginBucket[] = [
		{ key: hash('account', email.trim().toLowerCase()), limit: 5 },
	];
	// Socket-only mode is explicit: behind a BFF this is its address, not
	// the browser's. Never accept an arbitrary forwarded header as identity.
	if (process.env.LOGIN_RATE_LIMIT_DIRECT_CLIENT_SOCKET === 'true') {
		const address = req.socket?.remoteAddress;
		if (!address)
			throw new Error('Login limiter client address unavailable');
		buckets.push({ key: hash('ip', address), limit: 20 });
	}
	await reserve(buckets, 60_000);
}
