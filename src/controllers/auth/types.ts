import type { Request } from 'express';
import type { AuthRequestUser } from '../../types/express';

export type RegisterBody = {
	email: string;
	password: string;
	role: string;
	firstName: string;
	lastName: string;
	phone?: string | null;
	/** Wymagane przy role === INSTRUCTOR (profil w bazie wymaga numeru licencji). */
	licenseNumber?: string | null;
	/** Date-only YYYY-MM-DD; required for new instructors after rollout. */
	birthDate?: string | null;
	/** Wymagane przy role === INSTRUCTOR; dla innych rĂłl ignorowane. */
	schoolId?: string | null;
};

export type LoginBody = {
	email: string;
	password: string;
};

export type RequestWithUser = Request & { user: AuthRequestUser };
