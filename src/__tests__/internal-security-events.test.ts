import { createHmac, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const recordSecurityEvent = vi.hoisted(() =>
	vi.fn(async () => ({ id: 'saved', created: true })),
);
vi.mock('../services/security-events/record', () => ({ recordSecurityEvent }));

import { createApp } from '../app';

const secret = 'test-secret-for-bff-denial-signing-32-characters';
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let url: string;
let previousSecret: string | undefined;

function signedHeaders(body: string, timestamp = new Date().toISOString()) {
	return {
		'Content-Type': 'application/json',
		'X-OSK-Audit-Timestamp': timestamp,
		'X-OSK-Audit-Signature': `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`,
	};
}

beforeAll(async () => {
	previousSecret = process.env.SECURITY_LOGS_BFF_SHARED_SECRET;
	process.env.SECURITY_LOGS_BFF_SHARED_SECRET = secret;
	server = createApp().listen(0, '127.0.0.1');
	await new Promise<void>((resolve) => server.once('listening', resolve));
	url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/internal/security-events/bff-denial`;
});

afterAll(async () => {
	await new Promise<void>((resolve) => server.close(() => resolve()));
	if (previousSecret === undefined)
		delete process.env.SECURITY_LOGS_BFF_SHARED_SECRET;
	else process.env.SECURITY_LOGS_BFF_SHARED_SECRET = previousSecret;
});

describe('BFF denial intake', () => {
	it('rejects an unsigned and stale message', async () => {
		const body = JSON.stringify({
			attemptId: randomUUID(),
			method: 'PATCH',
			path: '/manager/accounts/a/status',
			reasonCode: 'MISSING_SESSION',
		});
		const unsigned = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body,
		});
		expect(unsigned.status).toBe(401);
		const stale = await fetch(url, {
			method: 'POST',
			headers: signedHeaders(body, '2020-01-01T00:00:00.000Z'),
			body,
		});
		expect(stale.status).toBe(401);
		expect(recordSecurityEvent).not.toHaveBeenCalled();
	});

	it('accepts only a known operation and does not pass arbitrary actor fields', async () => {
		const injected = JSON.stringify({
			attemptId: randomUUID(),
			method: 'PATCH',
			path: '/manager/accounts/a/status',
			reasonCode: 'MISSING_SESSION',
			actorUserId: randomUUID(),
		});
		expect(
			(
				await fetch(url, {
					method: 'POST',
					headers: signedHeaders(injected),
					body: injected,
				})
			).status,
		).toBe(400);
		const unknown = JSON.stringify({
			attemptId: randomUUID(),
			method: 'PATCH',
			path: '/anything/a/status',
			reasonCode: 'MISSING_SESSION',
		});
		expect(
			(
				await fetch(url, {
					method: 'POST',
					headers: signedHeaders(unknown),
					body: unknown,
				})
			).status,
		).toBe(400);
		const valid = JSON.stringify({
			attemptId: randomUUID(),
			method: 'PATCH',
			path: '/manager/accounts/a/status',
			reasonCode: 'MISSING_SESSION',
		});
		expect(
			(
				await fetch(url, {
					method: 'POST',
					headers: signedHeaders(valid),
					body: valid,
				})
			).status,
		).toBe(202);
		expect(recordSecurityEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'AUTHENTICATION_REQUIRED',
				operationCode: 'MANAGER_ACCOUNT_STATUS_UPDATE',
				routeTemplate: '/manager/accounts/:userId/status',
				schoolScopes: [],
			}),
		);
	});
});
