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
		accountAction: { count: vi.fn(), create: vi.fn(), update: vi.fn() },
		accountSession: { updateMany: vi.fn() },
		$queryRaw: vi.fn(),
		$transaction: vi.fn(),
	};
	return {
		db,
		updateAuthUser: vi.fn(),
		recordEvent: vi.fn(),
		resetPasswordForEmail: vi.fn(),
	};
});

vi.mock('../../lib/prisma', () => ({ getPrisma: () => mocks.db }));
vi.mock('../../lib/supabaseAdmin', () => ({
	getSupabaseAdminClient: () => ({
		auth: { admin: { updateUserById: mocks.updateAuthUser } },
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
		vi.clearAllMocks();
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
});
