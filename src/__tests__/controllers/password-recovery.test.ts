import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getClaims: vi.fn(),
	setSession: vi.fn(),
	updateUser: vi.fn(),
	signOut: vi.fn(),
	findUnique: vi.fn(),
	revokeSessions: vi.fn(),
	resetPasswordForEmail: vi.fn(),
}));

vi.mock('../../lib/supabase', () => ({
	getSupabaseClient: () => ({
		auth: {
			getClaims: mocks.getClaims,
			setSession: mocks.setSession,
			updateUser: mocks.updateUser,
			signOut: mocks.signOut,
			resetPasswordForEmail: mocks.resetPasswordForEmail,
		},
	}),
}));
vi.mock('../../lib/prisma', () => ({
	getPrisma: () => ({ user: { findUnique: mocks.findUnique } }),
}));
vi.mock('../../lib/accountSessions', () => ({
	revokeAccountSessions: mocks.revokeSessions,
}));

import {
	completePasswordRecovery,
	requestPasswordRecovery,
} from '../../controllers/auth/recovery.handlers';

const userId = '11111111-1111-4111-8111-111111111111';

function response(): Response {
	const res = { status: vi.fn(), json: vi.fn() };
	res.status.mockReturnValue(res);
	res.json.mockReturnValue(res);
	return res as unknown as Response;
}

function request(): Request {
	return {
		body: {
			accessToken: 'access-token',
			refreshToken: 'refresh-token',
			password: 'a-strong-password',
		},
	} as Request;
}

describe('completePasswordRecovery', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getClaims.mockResolvedValue({
			data: {
				claims: {
					sub: userId,
					email: 'new@example.com',
					amr: [{ method: 'otp' }],
				},
			},
			error: null,
		});
		mocks.findUnique.mockResolvedValue({
			email: 'new@example.com',
			isActive: true,
			deletedAt: null,
		});
		mocks.setSession.mockResolvedValue({
			data: { user: { id: userId } },
			error: null,
		});
		mocks.updateUser.mockResolvedValue({ error: null });
		mocks.signOut.mockResolvedValue({ error: null });
		mocks.revokeSessions.mockResolvedValue(undefined);
	});

	it('rejects a normal sign-in token', async () => {
		mocks.getClaims.mockResolvedValueOnce({
			data: {
				claims: {
					sub: userId,
					email: 'new@example.com',
					amr: [{ method: 'password' }],
				},
			},
			error: null,
		});
		const res = response();
		await completePasswordRecovery(request(), res);
		expect(res.status).toHaveBeenCalledWith(401);
		expect(mocks.updateUser).not.toHaveBeenCalled();
	});

	it('rejects a recovery token issued to a previous email', async () => {
		mocks.findUnique.mockResolvedValueOnce({
			email: 'changed@example.com',
			isActive: true,
			deletedAt: null,
		});
		const res = response();
		await completePasswordRecovery(request(), res);
		expect(res.status).toHaveBeenCalledWith(403);
		expect(mocks.setSession).not.toHaveBeenCalled();
	});

	it('changes the password and revokes the app sessions', async () => {
		const res = response();
		await completePasswordRecovery(request(), res);
		expect(mocks.updateUser).toHaveBeenCalledWith({
			password: 'a-strong-password',
		});
		expect(mocks.revokeSessions).toHaveBeenCalledWith(userId);
		expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
		expect(res.status).toHaveBeenCalledWith(200);
	});
});

describe('requestPasswordRecovery', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv('FRONTEND_URL', 'http://localhost:3000');
	});
	afterEach(() => vi.unstubAllEnvs());

	it('returns success when Supabase accepts the reset request', async () => {
		mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
		const res = response();
		await requestPasswordRecovery(
			{ body: { email: 'new@example.com' } } as Request,
			res,
		);
		expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(
			'new@example.com',
			{ redirectTo: 'http://localhost:3000/reset-password' },
		);
		expect(res.status).toHaveBeenCalledWith(200);
	});

	it('does not claim an email was sent when Supabase rejects it', async () => {
		mocks.resetPasswordForEmail.mockResolvedValue({
			error: new Error('Email rate limit reached'),
		});
		const res = response();
		await requestPasswordRecovery(
			{ body: { email: 'new@example.com' } } as Request,
			res,
		);
		expect(res.status).toHaveBeenCalledWith(502);
		expect(res.json).toHaveBeenCalledWith({
			success: false,
			error: 'Password reset email could not be sent',
		});
	});
});
