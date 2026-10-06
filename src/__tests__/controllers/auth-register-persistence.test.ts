import { Prisma, Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPrisma } from '../../lib/prisma';
import { persistRegisteredUser } from '../../controllers/auth/register.persistence';
import { ensureRoleProfilesAfterUserUpsert } from '../../controllers/auth/register.helpers';

vi.mock('../../lib/prisma', () => ({ getPrisma: vi.fn() }));
vi.mock('../../lib/instructorSchoolRegistration', () => ({
	attachInstructorToSchoolWithDefaultsInTx: vi.fn(),
}));
vi.mock('../../controllers/auth/register.helpers', async (importOriginal) => ({
	...(await importOriginal<
		typeof import('../../controllers/auth/register.helpers')
	>()),
	ensureRoleProfilesAfterUserUpsert: vi.fn(),
}));
const tx = { user: { create: vi.fn(), update: vi.fn() } };
const prisma = {
	user: { findUnique: vi.fn() },
	$transaction: vi.fn(async (callback: (value: typeof tx) => Promise<void>) =>
		callback(tx),
	),
};
const birthDate = new Date('2000-02-29T00:00:00.000Z');
const input = {
	authUserId: 'auth-1',
	emailTrimmed: 'jan@example.com',
	firstName: 'Jan',
	lastName: 'Nowak',
	targetRole: Role.INSTRUCTOR,
	phone: null,
	instructorLicenseTrimmed: 'LIC-1',
	instructorBirthDate: birthDate,
};

describe('registration forwards birth date through persistence branches', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(getPrisma).mockReturnValue(
			prisma as unknown as ReturnType<typeof getPrisma>,
		);
		prisma.user.findUnique.mockResolvedValue(null);
		tx.user.create.mockResolvedValue({});
	});
	it('persists the nested date for a new user', async () => {
		await persistRegisteredUser(input);
		expect(tx.user.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				instructorProfile: {
					create: { licenseNumber: 'LIC-1', birthDate },
				},
			}),
		});
	});
	it('forwards the date when completing an existing Auth id', async () => {
		prisma.user.findUnique.mockResolvedValueOnce({
			id: input.authUserId,
			email: input.emailTrimmed,
		});
		await persistRegisteredUser(input);
		expect(ensureRoleProfilesAfterUserUpsert).toHaveBeenCalledWith(
			tx,
			input.authUserId,
			Role.INSTRUCTOR,
			'LIC-1',
			birthDate,
		);
		expect(tx.user.create).not.toHaveBeenCalled();
	});
	it('forwards the date during concurrent creation recovery', async () => {
		prisma.user.findUnique
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({
				id: input.authUserId,
				email: input.emailTrimmed,
			});
		tx.user.create.mockRejectedValueOnce(
			new Prisma.PrismaClientKnownRequestError('duplicate', {
				code: 'P2002',
				clientVersion: '6.15.0',
			}),
		);
		await persistRegisteredUser(input);
		expect(ensureRoleProfilesAfterUserUpsert).toHaveBeenCalledWith(
			tx,
			input.authUserId,
			Role.INSTRUCTOR,
			'LIC-1',
			birthDate,
		);
	});
});
