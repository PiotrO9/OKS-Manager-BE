import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	signIn: vi.fn(),
	findUnique: vi.fn(),
	registerSession: vi.fn(),
	resolveTarget: vi.fn(),
	recordEvent: vi.fn(),
	checkLimit: vi.fn(),
}));

vi.mock('../../services/loginRateLimit', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../services/loginRateLimit')>()),
	checkLoginRateLimit: mocks.checkLimit,
}));

vi.mock('../../lib/supabase', () => ({
	getSupabaseClient: () => ({ auth: { signInWithPassword: mocks.signIn } }),
}));
vi.mock('../../lib/prisma', () => ({
	getPrisma: () => ({ user: { findUnique: mocks.findUnique } }),
}));
vi.mock('../../lib/accountSessions', () => ({
	registerAccountSession: mocks.registerSession,
	getAccountSessionDecision: vi.fn(),
	sessionIdFromToken: vi.fn(),
}));
vi.mock('../../services/security-events/record', () => ({
	resolveLoginTarget: mocks.resolveTarget,
}));
vi.mock('../../lib/securityEventContext', () => ({
	recordRequestSecurityEvent: mocks.recordEvent,
}));

import { login } from '../../controllers/auth/session.handlers';
import { LoginLimitExceeded } from '../../services/loginRateLimit';

function request(): Request {
	return {
		body: { email: 'student@example.com', password: 'very-secret' },
		headers: {},
	} as Request;
}

function response(): Response {
	return {
		status: vi.fn().mockReturnThis(),
		json: vi.fn().mockReturnThis(),
		cookie: vi.fn().mockReturnThis(),
	} as unknown as Response;
}

describe('login security events', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.checkLimit.mockReset().mockResolvedValue(undefined);
		mocks.resolveTarget.mockResolvedValue({
			targetUserId: '11111111-1111-4111-8111-111111111111',
			targetDisplayName: 'Jan Kowalski',
			schoolScopes: [
				{
					schoolId: '22222222-2222-4222-8222-222222222222',
					actorVisibility: 'UNKNOWN',
				},
			],
		});
		mocks.recordEvent.mockResolvedValue(undefined);
	});

	it('rejects an exhausted application budget before calling Auth', async () => {
		mocks.checkLimit.mockRejectedValue(new LoginLimitExceeded());
		const res = response();
		await login(request(), res);
		expect(res.status).toHaveBeenCalledWith(429);
		expect(mocks.signIn).not.toHaveBeenCalled();
		expect(mocks.recordEvent).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				type: 'LOGIN_RATE_LIMITED',
				httpStatus: 429,
			}),
		);
	});

	it('rejects storage failure as technical unavailability before calling Auth', async () => {
		mocks.checkLimit.mockRejectedValue(new Error('storage unavailable'));
		const res = response();
		await login(request(), res);
		expect(res.status).toHaveBeenCalledWith(503);
		expect(mocks.signIn).not.toHaveBeenCalled();
		expect(mocks.recordEvent).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				reasonCode: 'LOGIN_LIMIT_UNAVAILABLE',
				httpStatus: 503,
			}),
		);
	});

	it('preserves the provider rate-limit status in both HTTP and audit', async () => {
		mocks.signIn.mockResolvedValue({
			data: {},
			error: {
				code: 'over_request_rate_limit',
				message: 'internal provider detail',
			},
		});
		const res = response();
		await login(request(), res);
		expect(res.status).toHaveBeenCalledWith(429);
		expect(JSON.stringify(vi.mocked(res.json).mock.calls)).not.toContain(
			'internal provider detail',
		);
		expect(mocks.recordEvent).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				type: 'LOGIN_RATE_LIMITED',
				httpStatus: 429,
			}),
		);
	});

	it('records invalid credentials as an unknown actor attempting a known account', async () => {
		mocks.signIn.mockResolvedValue({
			data: {},
			error: {
				code: 'invalid_credentials',
				message: 'Invalid login credentials',
			},
		});
		const req = request();
		const res = response();
		await login(req, res);

		expect(res.status).toHaveBeenCalledWith(401);
		expect(mocks.recordEvent).toHaveBeenCalledWith(
			req,
			expect.objectContaining({
				type: 'LOGIN_FAILED',
				targetUserId: '11111111-1111-4111-8111-111111111111',
				loginIdentifier: 'student@example.com',
			}),
		);
		const event = mocks.recordEvent.mock.calls[0]?.[1];
		expect(event.actorUserId).toBeUndefined();
		expect(JSON.stringify(event)).not.toContain('very-secret');
	});

	it('keeps a provider fault out of the wrong-password detector', async () => {
		mocks.signIn.mockResolvedValue({
			data: {},
			error: { code: 'unexpected_failure', message: 'Auth unavailable' },
		});
		await login(request(), response());
		expect(mocks.recordEvent).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				type: 'LOGIN_PROVIDER_ERROR',
				outcome: 'FAILURE',
			}),
		);
	});

	it('classifies provider account rejection without treating it as a wrong password', async () => {
		mocks.signIn.mockResolvedValue({
			data: {},
			error: { code: 'user_banned', message: 'Account unavailable' },
		});
		await login(request(), response());
		expect(mocks.recordEvent).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({
				type: 'LOGIN_DENIED',
				outcome: 'DENIED',
			}),
		);
	});

	it('records success only after the local session is registered', async () => {
		const user = {
			id: '11111111-1111-4111-8111-111111111111',
			email: 'student@example.com',
			firstName: 'Jan',
			lastName: 'Kowalski',
			role: 'STUDENT',
			phone: null,
			isActive: true,
			deletedAt: null,
		};
		mocks.signIn.mockResolvedValue({
			data: {
				user: { id: user.id },
				session: { access_token: 'access', refresh_token: 'refresh' },
			},
			error: null,
		});
		mocks.findUnique.mockResolvedValue(user);
		mocks.registerSession.mockResolvedValue(true);
		const req = request();
		const res = response();
		await login(req, res);

		expect(mocks.registerSession).toHaveBeenCalledWith(user.id, 'access');
		expect(mocks.recordEvent).toHaveBeenCalledWith(
			req,
			expect.objectContaining({
				type: 'LOGIN_SUCCEEDED',
				actorUserId: user.id,
				targetUserId: user.id,
				schoolScopes: [
					expect.objectContaining({
						actorVisibility: 'KNOWN',
						actorUserId: user.id,
					}),
				],
			}),
		);
		expect(res.status).toHaveBeenCalledWith(200);
	});
});
