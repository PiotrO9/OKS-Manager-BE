import { Role } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const db = {
		drivingSchool: { findFirst: vi.fn(), findUnique: vi.fn() },
		user: {
			findFirst: vi.fn(),
			findUnique: vi.fn(),
			findMany: vi.fn(),
			update: vi.fn(),
		},
		accountAction: {
			count: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
			findFirst: vi.fn(),
		},
		accountSession: { updateMany: vi.fn() },
		$queryRaw: vi.fn(),
		$transaction: vi.fn(),
	};
	return {
		db,
		updateAuthUser: vi.fn(),
		getAuthUser: vi.fn(),
		recordEvent: vi.fn(),
		resetPasswordForEmail: vi.fn(),
	};
});

vi.mock('../../lib/prisma', () => ({ getPrisma: () => mocks.db }));
vi.mock('../../lib/supabaseAdmin', () => ({
	getSupabaseAdminClient: () => ({
		auth: {
			admin: {
				updateUserById: mocks.updateAuthUser,
				getUserById: mocks.getAuthUser,
			},
		},
	}),
}));
vi.mock('../../lib/supabase', () => ({
	getSupabaseClient: () => ({
		auth: { resetPasswordForEmail: mocks.resetPasswordForEmail },
	}),
}));
vi.mock('../../services/security-events/record', () => ({
	recordSecurityEvent: mocks.recordEvent,
}));

import {
	changeManagerAccountEmail,
	reconcileManagerAccountEmail,
	getManagerAccount,
	listManagerAccounts,
	setManagerAccountActive,
	sendManagerAccountPasswordReset,
} from '../../services/managerAccounts.service';

const actorId = '11111111-1111-4111-8111-111111111111';
const schoolId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const account = {
	id: userId,
	role: Role.STUDENT,
	firstName: 'Jan',
	lastName: 'Kowalski',
	email: 'old@example.com',
	phone: null,
	isActive: true,
	deletedAt: null,
	accountActionsFor: [],
};

describe('manager account scope and email synchronization', () => {
	afterEach(() => vi.unstubAllEnvs());

	it('sends a password reset to the canonical Polish page', async () => {
		vi.stubEnv(
			'FRONTEND_URL',
			'https://school.example,https://preview.example',
		);
		mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
		await expect(
			sendManagerAccountPasswordReset(actorId, schoolId, userId),
		).resolves.toEqual({ sent: true });
		expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith(
			account.email,
			{
				redirectTo: 'https://school.example/ustaw-haslo',
			},
		);
	});

	beforeEach(() => {
		vi.resetAllMocks();
		mocks.db.$transaction.mockImplementation(
			async (callback: (tx: typeof mocks.db) => Promise<unknown>) =>
				callback(mocks.db),
		);
		mocks.db.$queryRaw.mockResolvedValue([{ id: userId }]);
		mocks.db.drivingSchool.findFirst.mockResolvedValue({ id: schoolId });
		mocks.db.drivingSchool.findUnique.mockResolvedValue(null);
		mocks.db.user.findFirst.mockResolvedValue(account);
		mocks.db.user.findUnique.mockResolvedValue(null);
		mocks.db.accountAction.count.mockResolvedValue(0);
		mocks.db.accountAction.create.mockResolvedValue({ id: 'action-1' });
		mocks.db.accountAction.update.mockResolvedValue({ id: 'action-1' });
		mocks.db.user.update.mockResolvedValue({ id: userId });
		mocks.db.accountSession.updateMany.mockResolvedValue({ count: 1 });
		mocks.updateAuthUser.mockResolvedValue({
			data: { user: { email: 'new@example.com' } },
			error: null,
		});
		mocks.recordEvent.mockResolvedValue({ id: 'event-1', created: true });
		mocks.db.accountAction.findFirst.mockResolvedValue({
			id: 'action-1',
			oldValue: 'old@example.com',
			newValue: 'new@example.com',
			requestId: 'request-1',
		});
		mocks.getAuthUser.mockResolvedValue({
			data: { user: { email: 'new@example.com' } },
			error: null,
		});
	});

	it('does not expose accounts when the manager does not own the school', async () => {
		mocks.db.drivingSchool.findFirst.mockResolvedValue(null);
		await expect(
			getManagerAccount(actorId, schoolId, userId),
		).rejects.toMatchObject({ statusCode: 404 });
		await expect(
			listManagerAccounts(actorId, schoolId),
		).rejects.toMatchObject({ statusCode: 404 });
		expect(mocks.db.user.findFirst).not.toHaveBeenCalled();
		expect(mocks.db.user.findMany).not.toHaveBeenCalled();
	});

	it('marks an existing but inaccessible school without changing the public 404', async () => {
		mocks.db.drivingSchool.findFirst.mockResolvedValue(null);
		mocks.db.drivingSchool.findUnique.mockResolvedValue({ id: schoolId });
		await expect(
			getManagerAccount(actorId, schoolId, userId),
		).rejects.toMatchObject({
			statusCode: 404,
			message: 'Driving school not found',
			securityAudit: {
				reasonCode: 'SCHOOL_ACCESS_DENIED',
				schoolId,
			},
		});
	});

	it('attributes a masked account denial to the account actual school', async () => {
		const otherSchoolId = '44444444-4444-4444-8444-444444444444';
		mocks.db.user.findFirst.mockResolvedValue(null);
		mocks.db.user.findUnique.mockResolvedValue({
			id: userId,
			firstName: 'Jan',
			lastName: 'Kowalski',
			studentProfile: { studentSchools: [{ schoolId: otherSchoolId }] },
			instructorProfile: null,
		});
		await expect(
			getManagerAccount(actorId, schoolId, userId),
		).rejects.toMatchObject({
			statusCode: 404,
			message: 'Account not found',
			securityAudit: {
				reasonCode: 'ACCOUNT_ACCESS_DENIED',
				schoolId: otherSchoolId,
				targetUserId: userId,
			},
		});
	});

	it('requires current school membership before calling Supabase Auth', async () => {
		mocks.db.user.findFirst.mockResolvedValue(null);
		await expect(
			changeManagerAccountEmail(
				actorId,
				schoolId,
				userId,
				'new@example.com',
			),
		).rejects.toMatchObject({ statusCode: 404 });
		expect(mocks.db.user.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					id: userId,
					OR: expect.any(Array),
				}),
			}),
		);
		expect(mocks.updateAuthUser).not.toHaveBeenCalled();
	});

	it('records repair state if Auth changes the email but the local database fails', async () => {
		mocks.db.user.update.mockRejectedValue(
			new Error('Database unavailable'),
		);
		await expect(
			changeManagerAccountEmail(
				actorId,
				schoolId,
				userId,
				'new@example.com',
			),
		).rejects.toMatchObject({
			statusCode: 502,
			message: 'Email changed in Auth; account synchronization required',
		});
		expect(mocks.updateAuthUser).toHaveBeenCalledWith(userId, {
			email: 'new@example.com',
			email_confirm: true,
		});
		expect(mocks.db.accountAction.update).toHaveBeenCalledWith({
			where: { id: 'action-1' },
			data: { status: 'REPAIR_REQUIRED' },
		});
		expect(mocks.recordEvent).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'ACCOUNT_CHANGE_REPAIR_REQUIRED' }),
		);
		expect(mocks.recordEvent).not.toHaveBeenCalledWith(
			expect.objectContaining({ type: 'ACCOUNT_EMAIL_CHANGED' }),
		);
	});

	it('records a completed block after the account transaction', async () => {
		mocks.db.user.update.mockResolvedValue({ id: userId, isActive: false });
		await setManagerAccountActive(
			actorId,
			schoolId,
			userId,
			false,
			'request-1',
		);
		expect(mocks.recordEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'ACCOUNT_BLOCKED',
				accountActionId: 'action-1',
				actorUserId: actorId,
				targetUserId: userId,
				schoolScopes: [expect.objectContaining({ schoolId })],
			}),
		);
	});

	it('does not record a block when status already matches', async () => {
		await setManagerAccountActive(
			actorId,
			schoolId,
			userId,
			true,
			'request-1',
		);
		expect(mocks.recordEvent).not.toHaveBeenCalled();
	});

	it('infers the school of archived accounts without requiring an active user', async () => {
		mocks.db.user.findUnique.mockResolvedValue({
			role: Role.STUDENT,
			studentProfile: { studentSchools: [{ schoolId }] },
		});
		mocks.db.user.findFirst.mockResolvedValue({
			...account,
			deletedAt: new Date('2026-01-01'),
		});
		const result = await getManagerAccount(actorId, undefined, userId);
		expect(result).toMatchObject({
			id: userId,
			schoolId,
			deletedAt: expect.any(Date),
		});
		expect(mocks.db.user.findUnique).toHaveBeenCalledWith(
			expect.objectContaining({ where: { id: userId } }),
		);
	});
	it('infers the school inside the locked status transaction and records it', async () => {
		mocks.db.user.findUnique.mockResolvedValue({
			role: Role.STUDENT,
			studentProfile: { studentSchools: [{ schoolId }] },
		});
		await setManagerAccountActive(actorId, undefined, userId, false);
		expect(mocks.db.$queryRaw).toHaveBeenCalled();
		expect(mocks.db.accountAction.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ schoolId }),
			}),
		);
	});
	it('does not expose an inferred account from another manager school', async () => {
		mocks.db.user.findUnique.mockResolvedValue({
			role: Role.STUDENT,
			studentProfile: { studentSchools: [{ schoolId }] },
		});
		mocks.db.drivingSchool.findFirst.mockResolvedValue(null);
		await expect(
			getManagerAccount(actorId, undefined, userId),
		).rejects.toMatchObject({ statusCode: 404 });
		expect(mocks.db.user.findFirst).not.toHaveBeenCalled();
	});
	it('does not pick the first of multiple account memberships', async () => {
		mocks.db.user.findUnique.mockResolvedValue({
			role: Role.INSTRUCTOR,
			instructorProfile: {
				instructorSchools: [{ schoolId }, { schoolId: actorId }],
			},
		});
		await expect(
			getManagerAccount(actorId, undefined, userId),
		).rejects.toMatchObject({ statusCode: 409 });
	});
	it('completes email synchronization and revokes sessions before auditing success', async () => {
		await expect(
			changeManagerAccountEmail(
				actorId,
				schoolId,
				userId,
				'new@example.com',
			),
		).resolves.toEqual({ id: userId, email: 'new@example.com' });
		expect(mocks.db.accountAction.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					status: 'PENDING',
					action: 'EMAIL_CHANGE',
				}),
			}),
		);
		expect(
			mocks.db.accountAction.update.mock.calls.map(
				(call) => call[0].data.status,
			),
		).toEqual(['AUTH_UPDATED', 'COMPLETED']);
		expect(mocks.db.accountSession.updateMany).toHaveBeenCalledWith({
			where: { userId, revokedAt: null },
			data: { revokedAt: expect.any(Date) },
		});
		expect(
			mocks.recordEvent.mock.calls.map((call) => call[0].type),
		).toEqual(['ACCOUNT_EMAIL_CHANGE_REQUESTED', 'ACCOUNT_EMAIL_CHANGED']);
		expect(
			mocks.updateAuthUser.mock.invocationCallOrder[0],
		).toBeGreaterThan(
			mocks.db.accountAction.create.mock.invocationCallOrder[0]!,
		);
		expect(
			mocks.db.accountSession.updateMany.mock.invocationCallOrder[0],
		).toBeLessThan(mocks.recordEvent.mock.invocationCallOrder[1]!);
	});
	it('records provider refusal without changing the local email or sessions', async () => {
		mocks.updateAuthUser.mockResolvedValue({
			data: { user: null },
			error: { message: 'unavailable' },
		});
		await expect(
			changeManagerAccountEmail(
				actorId,
				schoolId,
				userId,
				'new@example.com',
			),
		).rejects.toMatchObject({ statusCode: 502 });
		expect(mocks.db.accountAction.update).toHaveBeenCalledWith({
			where: { id: 'action-1' },
			data: { status: 'FAILED' },
		});
		expect(mocks.db.user.update).not.toHaveBeenCalled();
		expect(mocks.db.accountSession.updateMany).not.toHaveBeenCalled();
	});
	it('rejects starting another email change while a change is pending', async () => {
		mocks.db.user.findFirst.mockResolvedValue({
			...account,
			accountActionsFor: [{ status: 'PENDING' }],
		});
		await expect(
			changeManagerAccountEmail(
				actorId,
				schoolId,
				userId,
				'new@example.com',
			),
		).rejects.toMatchObject({ statusCode: 409 });
		expect(mocks.updateAuthUser).not.toHaveBeenCalled();
	});
	it('finishes repair when Auth already has the new email', async () => {
		await expect(
			reconcileManagerAccountEmail(actorId, schoolId, userId),
		).resolves.toEqual({
			id: userId,
			email: 'new@example.com',
			status: 'COMPLETED',
		});
		expect(mocks.updateAuthUser).not.toHaveBeenCalled();
		expect(mocks.db.user.update).toHaveBeenCalledWith({
			where: { id: userId },
			data: { email: 'new@example.com', updatedAt: expect.any(Date) },
		});
		expect(mocks.db.accountSession.updateMany).toHaveBeenCalled();
		expect(mocks.recordEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'ACCOUNT_EMAIL_CHANGED',
				requestId: 'request-1',
			}),
		);
	});
	it('marks repair as failed when Auth still has the old email', async () => {
		mocks.getAuthUser.mockResolvedValue({
			data: { user: { email: 'OLD@example.com' } },
			error: null,
		});
		await expect(
			reconcileManagerAccountEmail(actorId, schoolId, userId),
		).resolves.toEqual({ id: userId, status: 'FAILED' });
		expect(mocks.db.user.update).not.toHaveBeenCalled();
		expect(mocks.recordEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				type: 'ACCOUNT_CHANGE_FAILED',
				reasonCode: 'AUTH_EMAIL_UNCHANGED',
			}),
		);
	});
	it('rejects repair when Auth has an unexpected third email', async () => {
		mocks.getAuthUser.mockResolvedValue({
			data: { user: { email: 'third@example.com' } },
			error: null,
		});
		await expect(
			reconcileManagerAccountEmail(actorId, schoolId, userId),
		).rejects.toMatchObject({ statusCode: 409 });
		expect(mocks.db.accountAction.update).not.toHaveBeenCalled();
		expect(mocks.db.accountSession.updateMany).not.toHaveBeenCalled();
	});
	it('rejects repair without a pending operation before calling Auth', async () => {
		mocks.db.accountAction.findFirst.mockResolvedValue(null);
		await expect(
			reconcileManagerAccountEmail(actorId, schoolId, userId),
		).rejects.toMatchObject({ statusCode: 404 });
		expect(mocks.getAuthUser).not.toHaveBeenCalled();
	});
	it('rejects repair for another manager before calling Auth', async () => {
		mocks.db.drivingSchool.findFirst.mockResolvedValue(null);
		await expect(
			reconcileManagerAccountEmail(actorId, schoolId, userId),
		).rejects.toMatchObject({ statusCode: 404 });
		expect(mocks.getAuthUser).not.toHaveBeenCalled();
	});
	it('leaves repair pending when the provider cannot be read', async () => {
		mocks.getAuthUser.mockResolvedValue({
			data: { user: null },
			error: { message: 'unavailable' },
		});
		await expect(
			reconcileManagerAccountEmail(actorId, schoolId, userId),
		).rejects.toMatchObject({ statusCode: 502 });
		expect(mocks.db.accountAction.update).not.toHaveBeenCalled();
	});
	it('propagates a second local failure during repair without reporting success', async () => {
		const error = new Error('second failure');
		mocks.db.user.update.mockRejectedValue(error);
		await expect(
			reconcileManagerAccountEmail(actorId, schoolId, userId),
		).rejects.toBe(error);
		expect(mocks.recordEvent).not.toHaveBeenCalled();
		expect(mocks.db.accountAction.update).not.toHaveBeenCalled();
	});
	it('keeps a completed change successful even if best-effort audit recording fails', async () => {
		mocks.recordEvent.mockRejectedValue(new Error('audit unavailable'));
		await expect(
			changeManagerAccountEmail(
				actorId,
				schoolId,
				userId,
				'new@example.com',
			),
		).resolves.toEqual({ id: userId, email: 'new@example.com' });
		expect(mocks.db.accountAction.update).toHaveBeenLastCalledWith({
			where: { id: 'action-1' },
			data: { status: 'COMPLETED' },
		});
	});
});
