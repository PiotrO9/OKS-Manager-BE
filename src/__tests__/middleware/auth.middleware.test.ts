import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	getClaims: vi.fn(),
	findUnique: vi.fn(),
	getSessionDecision: vi.fn(),
	recordEvent: vi.fn(),
}));

vi.mock('../../lib/accountSessions', () => ({
	getAccountSessionDecision: mocks.getSessionDecision,
	sessionIdFromToken: () => '22222222-2222-4222-8222-222222222222',
}));

vi.mock('../../lib/securityEventContext', () => ({
	recordRequestSecurityEvent: mocks.recordEvent,
	actorSchoolScopes: vi.fn().mockResolvedValue([]),
	authenticatedAccountScopes: vi.fn().mockResolvedValue([]),
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
		mocks.getSessionDecision.mockResolvedValue({
			allowed: true,
			reason: 'ALLOWED',
		});
		mocks.recordEvent.mockResolvedValue(undefined);
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
		expect(mocks.getSessionDecision).toHaveBeenCalledWith(
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
		expect(mocks.recordEvent).toHaveBeenCalledWith(
			req,
			expect.objectContaining({
				type: 'SESSION_REJECTED',
				reasonCode: 'INVALID_TOKEN',
			}),
		);
		expect(next).not.toHaveBeenCalled();
	});

	it('distinguishes a revoked session from an unknown session', async () => {
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
		mocks.getSessionDecision.mockResolvedValue({
			allowed: false,
			reason: 'REVOKED_SESSION',
		});
		const req = {
			headers: { authorization: 'Bearer header.payload.signature' },
			requestId: 'request-3',
		} as unknown as Request;
		const res = createResponse();
		const next: NextFunction = vi.fn();

		await authMiddleware(req, res, next);

		expect(res.status).toHaveBeenCalledWith(401);
		expect(mocks.recordEvent).toHaveBeenCalledWith(
			req,
			expect.objectContaining({
				type: 'REVOKED_SESSION_USED',
				reasonCode: 'REVOKED_SESSION',
			}),
		);
		expect(next).not.toHaveBeenCalled();
	});
});
