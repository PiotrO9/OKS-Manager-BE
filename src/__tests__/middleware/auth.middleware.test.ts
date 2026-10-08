import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getClaims: vi.fn(),
	findUnique: vi.fn(),
	isSessionAllowed: vi.fn(),
}));

vi.mock('../../lib/accountSessions', () => ({
	isAccountSessionAllowed: mocks.isSessionAllowed,
	sessionIdFromToken: () => '22222222-2222-4222-8222-222222222222',
}));

vi.mock('../../lib/supabase', () => ({
	getSupabaseClient: () => ({
		auth: { getClaims: mocks.getClaims },
	}),
}));

vi.mock('../../lib/prisma', () => ({
	getPrisma: () => ({
		user: { findUnique: mocks.findUnique },
	}),
}));

import { authMiddleware } from '../../middleware/auth.middleware';

function createResponse(): Response {
	const response = {
		status: vi.fn(),
		json: vi.fn(),
	};

	response.status.mockReturnValue(response);
	response.json.mockReturnValue(response);

	return response as unknown as Response;
}

describe('authMiddleware', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.isSessionAllowed.mockResolvedValue(true);
	});

	it('verifies asymmetric JWT claims locally before loading the app user', async () => {
		const user = {
			id: '11111111-1111-4111-8111-111111111111',
			isActive: true,
			deletedAt: null,
			role: 'MANAGER',
		};
		mocks.getClaims.mockResolvedValue({
			data: { claims: { sub: user.id } },
			error: null,
		});
		mocks.findUnique.mockResolvedValue(user);
		const req = {
			headers: { authorization: 'Bearer header.payload.signature' },
			requestId: 'request-1',
		} as unknown as Request;
		const res = createResponse();
		const next: NextFunction = vi.fn();

		await authMiddleware(req, res, next);

		expect(mocks.getClaims).toHaveBeenCalledWith(
			'header.payload.signature',
		);
		expect(mocks.findUnique).toHaveBeenCalledWith({
			where: { id: user.id },
			include: { profile: true },
		});
		expect(req.user).toBe(user);
		expect(mocks.isSessionAllowed).toHaveBeenCalledWith(
			user.id,
			'22222222-2222-4222-8222-222222222222',
		);
		expect(next).toHaveBeenCalledOnce();
	});

	it('rejects a token when verified claims do not contain a subject', async () => {
		mocks.getClaims.mockResolvedValue({
			data: { claims: {} },
			error: null,
		});
		const req = {
			headers: { authorization: 'Bearer header.payload.signature' },
			requestId: 'request-2',
		} as unknown as Request;
		const res = createResponse();
		const next: NextFunction = vi.fn();

		await authMiddleware(req, res, next);

		expect(mocks.findUnique).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(401);
		expect(next).not.toHaveBeenCalled();
	});
});
