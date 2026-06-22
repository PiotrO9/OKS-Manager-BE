import { Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMeResponsePayload } from '../../controllers/auth.controller';
import type { AuthRequestUser } from '../../types/express';

const { prismaMock, contextMock } = vi.hoisted(() => ({
	prismaMock: {
		studentProfile: {
			findUnique: vi.fn(),
		},
	},
	contextMock: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({
	getPrisma: () => prismaMock,
}));

vi.mock('../../services/meContext.service', () => ({
	loadDrivingSchoolContextForMe: contextMock,
}));

function authUser(role: Role): AuthRequestUser {
	return {
		id: '11111111-1111-4111-8111-111111111111',
		email: 'student@example.com',
		firstName: 'Jan',
		lastName: 'Kowalski',
		role,
		phone: null,
		profile: null,
	} as AuthRequestUser;
}

describe('buildMeResponsePayload', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		contextMock.mockResolvedValue({
			drivingSchools: [],
			defaultOskId: null,
		});
		prismaMock.studentProfile.findUnique.mockResolvedValue({
			pkkNumber: '12345678901234567890',
		});
	});

	it('includes pkkNumber for student users', async () => {
		const result = await buildMeResponsePayload(authUser(Role.STUDENT));

		expect(result.pkkNumber).toBe('12345678901234567890');
		expect(prismaMock.studentProfile.findUnique).toHaveBeenCalledWith({
			where: { userId: '11111111-1111-4111-8111-111111111111' },
			select: { pkkNumber: true },
		});
	});

	it('does not load or include pkkNumber for non-student users', async () => {
		const result = await buildMeResponsePayload(authUser(Role.MANAGER));

		expect('pkkNumber' in result).toBe(false);
		expect(prismaMock.studentProfile.findUnique).not.toHaveBeenCalled();
	});
});
