import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { register } from '../../controllers/auth/register.handler';

const { signUp, persist, schools, profileLookup } = vi.hoisted(() => ({
	signUp: vi.fn(),
	persist: vi.fn(),
	schools: vi.fn(),
	profileLookup: vi.fn(),
}));
vi.mock('../../lib/supabase', () => ({
	getSupabaseClient: () => ({ auth: { signUp } }),
}));
vi.mock('../../lib/prisma', () => ({
	getPrisma: () => ({ instructorProfile: { findUnique: profileLookup } }),
}));
vi.mock('../../controllers/auth/register.persistence', () => ({
	persistRegisteredUser: persist,
}));
vi.mock('../../controllers/auth/register.school', () => ({
	resolveRegistrationSchoolIds: schools,
}));

function response() {
	return {
		status: vi.fn().mockReturnThis(),
		json: vi.fn().mockReturnThis(),
	} as unknown as Response;
}
function request(overrides: Record<string, unknown> = {}) {
	return {
		user: { id: 'manager-1', role: 'MANAGER' },
		body: {
			email: 'instructor@example.com',
			password: 'secret123',
			role: 'INSTRUCTOR',
			firstName: 'Jan',
			lastName: 'Nowak',
			licenseNumber: 'LIC-1',
			birthDate: '2000-02-29',
			...overrides,
		},
	} as unknown as Request;
}

describe('register birth date validation before Auth', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv('INSTRUCTOR_BIRTH_DATE_REQUIRED', 'true');
		signUp.mockResolvedValue({
			data: { user: { id: 'auth-1' }, session: null },
			error: null,
		});
		persist.mockResolvedValue(undefined);
		schools.mockResolvedValue({ validatedInstructorSchoolId: 'school-1' });
		profileLookup.mockResolvedValue({ id: 'instructor-1' });
	});
	afterEach(() => vi.unstubAllEnvs());
	it.each([undefined, null, '', '2001-02-29', '9999-01-01', 42])(
		'rejects %s without creating an Auth account',
		async (birthDate) => {
			const res = response();
			await register(request({ birthDate }), res);
			expect(res.status).toHaveBeenCalledWith(400);
			expect(signUp).not.toHaveBeenCalled();
			expect(persist).not.toHaveBeenCalled();
		},
	);
	it('passes the validated date into persistence and returns 201', async () => {
		const res = response();
		await register(request(), res);
		expect(persist).toHaveBeenCalledWith(
			expect.objectContaining({
				instructorBirthDate: new Date('2000-02-29T00:00:00.000Z'),
			}),
		);
		expect(res.status).toHaveBeenCalledWith(201);
	});
	it('keeps student registration independent of instructor dates', async () => {
		const res = response();
		await register(
			request({
				role: 'STUDENT',
				birthDate: undefined,
				licenseNumber: undefined,
			}),
			res,
		);
		expect(signUp).toHaveBeenCalledOnce();
		expect(persist).toHaveBeenCalledWith(
			expect.objectContaining({
				targetRole: 'STUDENT',
				instructorBirthDate: null,
			}),
		);
		expect(res.status).toHaveBeenCalledWith(200);
	});
	it('accepts an older client only in the rollout phase', async () => {
		vi.stubEnv('INSTRUCTOR_BIRTH_DATE_REQUIRED', 'false');
		await register(request({ birthDate: undefined }), response());
		expect(persist).toHaveBeenCalledWith(
			expect.objectContaining({ instructorBirthDate: null }),
		);
	});
});
