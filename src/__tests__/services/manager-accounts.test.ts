import { Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const db = {
		drivingSchool: { findFirst: vi.fn() },
		user: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
		accountAction: { count: vi.fn(), create: vi.fn(), update: vi.fn() },
		accountSession: { updateMany: vi.fn() },
		$queryRaw: vi.fn(),
		$transaction: vi.fn(),
	};
	return { db, updateAuthUser: vi.fn() };
});

vi.mock('../../lib/prisma', () => ({ getPrisma: () => mocks.db }));
vi.mock('../../lib/supabaseAdmin', () => ({
	getSupabaseAdminClient: () => ({
		auth: { admin: { updateUserById: mocks.updateAuthUser } },
	}),
}));
vi.mock('../../lib/supabase', () => ({
	getSupabaseClient: () => ({ auth: {} }),
}));

import {
	changeManagerAccountEmail,
	getManagerAccount,
	listManagerAccounts,
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
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.db.$transaction.mockImplementation(
			async (callback: (tx: typeof mocks.db) => Promise<unknown>) =>
				callback(mocks.db),
		);
		mocks.db.$queryRaw.mockResolvedValue([{ id: userId }]);
		mocks.db.drivingSchool.findFirst.mockResolvedValue({ id: schoolId });
		mocks.db.user.findFirst.mockResolvedValue(account);
		mocks.db.accountAction.count.mockResolvedValue(0);
		mocks.db.accountAction.create.mockResolvedValue({ id: 'action-1' });
		mocks.db.accountAction.update.mockResolvedValue({ id: 'action-1' });
		mocks.db.user.update.mockResolvedValue({ id: userId });
		mocks.db.accountSession.updateMany.mockResolvedValue({ count: 1 });
		mocks.updateAuthUser.mockResolvedValue({
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
	});
});
