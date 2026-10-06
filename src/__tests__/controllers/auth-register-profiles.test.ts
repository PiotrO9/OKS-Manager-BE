import { Prisma, Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	buildUserCreateWithRoleProfiles,
	ensureRoleProfilesAfterUserUpsert,
	registerDbProfileFromRequest,
} from '../../controllers/auth/register.helpers';

vi.mock('../../lib/prisma', () => ({ getPrisma: vi.fn() }));
const birthDate = new Date('2000-02-29T00:00:00.000Z');
const tx = {
	user: { findUnique: vi.fn() },
	userProfile: { create: vi.fn() },
	studentProfile: { create: vi.fn() },
	instructorProfile: { create: vi.fn(), updateMany: vi.fn() },
};
const transaction = tx as unknown as Prisma.TransactionClient;

describe('registration profile birth date persistence', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		tx.user.findUnique.mockResolvedValue({
			profile: { id: 'profile-1' },
			instructorProfile: { id: 'instructor-1' },
			studentProfile: null,
		});
		tx.instructorProfile.updateMany.mockResolvedValue({ count: 1 });
	});
	it('includes the date in a new nested profile', () => {
		const profile = registerDbProfileFromRequest(
			'jan@example.com',
			'Jan',
			'Nowak',
			Role.INSTRUCTOR,
			null,
		);
		const data = buildUserCreateWithRoleProfiles(
			'auth-1',
			profile,
			Role.INSTRUCTOR,
			'LIC-1',
			birthDate,
		);
		expect(data.instructorProfile).toEqual({
			create: { licenseNumber: 'LIC-1', birthDate },
		});
	});
	it('includes the date when recovering a missing instructor profile', async () => {
		tx.user.findUnique.mockResolvedValue({
			profile: { id: 'profile-1' },
			instructorProfile: null,
			studentProfile: null,
		});
		await ensureRoleProfilesAfterUserUpsert(
			transaction,
			'auth-1',
			Role.INSTRUCTOR,
			'LIC-1',
			birthDate,
		);
		expect(tx.instructorProfile.create).toHaveBeenCalledWith({
			data: { userId: 'auth-1', licenseNumber: 'LIC-1', birthDate },
		});
	});
	it('atomically accepts only empty or identical existing dates', async () => {
		await ensureRoleProfilesAfterUserUpsert(
			transaction,
			'auth-1',
			Role.INSTRUCTOR,
			'LIC-1',
			birthDate,
		);
		expect(tx.instructorProfile.updateMany).toHaveBeenCalledWith({
			where: {
				userId: 'auth-1',
				OR: [{ birthDate: null }, { birthDate }],
			},
			data: { birthDate },
		});
	});
	it('does not overwrite a different existing date', async () => {
		tx.instructorProfile.updateMany.mockResolvedValue({ count: 0 });
		await expect(
			ensureRoleProfilesAfterUserUpsert(
				transaction,
				'auth-1',
				Role.INSTRUCTOR,
				'LIC-1',
				birthDate,
			),
		).rejects.toMatchObject({ statusCode: 409 });
	});
	it('does not clear a historical date when an older client omits it', async () => {
		await ensureRoleProfilesAfterUserUpsert(
			transaction,
			'auth-1',
			Role.INSTRUCTOR,
			'LIC-1',
			null,
		);
		expect(tx.instructorProfile.updateMany).not.toHaveBeenCalled();
	});
});
