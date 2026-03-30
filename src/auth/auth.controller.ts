import { Request, Response } from 'express';
import { Prisma, Role, User } from '@prisma/client';
import { sendJsonError, sendJsonSuccess } from '../lib/apiResponse';
import { getPrisma } from '../lib/prisma';
import { getSupabaseClient } from '../lib/supabase';
import { canInvokerRegisterUserWithRole } from './registerRolePolicy';

type RegisterBody = {
	email: string;
	password: string;
	role: string;
	firstName: string;
	lastName: string;
	phone?: string | null;
};

type LoginBody = {
	email: string;
	password: string;
};

const REGISTRATION_TARGET_ROLES: ReadonlySet<Role> = new Set([
	Role.INSTRUCTOR,
	Role.STUDENT,
]);

function parseRegistrationTargetRole(raw: unknown): Role | null {
	if (typeof raw !== 'string') {
		return null;
	}
	const v = raw.trim();
	if (v === Role.INSTRUCTOR || v === Role.STUDENT) {
		return v as Role;
	}
	return null;
}

function registerDbProfileFromRequest(
	emailTrimmed: string,
	firstName: string,
	lastName: string,
	targetRole: Role,
	phone: RegisterBody['phone'],
) {
	return {
		email: emailTrimmed,
		firstName: String(firstName).trim(),
		lastName: String(lastName).trim(),
		role: targetRole,
		phone:
			phone !== undefined && phone !== null && String(phone).trim() !== ''
				? String(phone).trim()
				: null,
	};
}

type RequestWithUser = Request & { user: User };

async function register(req: Request, res: Response) {
	const actor = (req as RequestWithUser).user;
	const {
		email,
		password,
		role: roleRaw,
		firstName,
		lastName,
		phone,
	}: RegisterBody = req.body;

	if (!email || !password || !roleRaw || !firstName || !lastName) {
		return sendJsonError(
			res,
			'Email, password, role, firstName and lastName required',
			400,
		);
	}

	const targetRole = parseRegistrationTargetRole(roleRaw);
	if (!targetRole || !REGISTRATION_TARGET_ROLES.has(targetRole)) {
		return sendJsonError(
			res,
			'Invalid role for registration (expected INSTRUCTOR or STUDENT)',
			400,
		);
	}

	if (!canInvokerRegisterUserWithRole(actor.role, targetRole)) {
		return sendJsonError(res, 'Forbidden', 403);
	}

	const emailTrimmed = String(email).trim();
	const supabase = getSupabaseClient();

	const { data, error } = await supabase.auth.signUp({
		email: emailTrimmed,
		password,
	});

	if (error) {
		return sendJsonError(res, error.message, 400);
	}

	const authUserId = data.user?.id;
	if (!authUserId) {
		console.error('register: signUp succeeded but no user id returned');
		return sendJsonError(res, 'Registration incomplete', 500);
	}

	const prisma = getPrisma();

	const existingById = await prisma.user.findUnique({
		where: { id: authUserId },
	});
	if (existingById) {
		if (existingById.email !== emailTrimmed) {
			return sendJsonError(
				res,
				'Account identifier already in use with a different email',
				409,
			);
		}

		const profileData = registerDbProfileFromRequest(
			emailTrimmed,
			firstName,
			lastName,
			targetRole,
			phone,
		);

		try {
			await prisma.user.update({
				where: { id: authUserId },
				data: profileData,
			});
		} catch (err) {
			console.error('register: user.update failed (existingById)', err);
			return sendJsonError(
				res,
				'Failed to complete user registration',
				500,
			);
		}

		return sendJsonSuccess(res, {
			user: data.user,
			session: data.session,
		});
	}

	const existingByEmail = await prisma.user.findUnique({
		where: { email: emailTrimmed },
	});
	if (existingByEmail) {
		console.error(
			'register: email exists in app DB under different id after signUp — orphan Auth user possible',
			{ authUserId, existingUserId: existingByEmail.id },
		);
		return sendJsonError(res, 'Email already registered', 409);
	}

	const userCreateData = {
		id: authUserId,
		...registerDbProfileFromRequest(
			emailTrimmed,
			firstName,
			lastName,
			targetRole,
			phone,
		),
	};

	try {
		await prisma.user.create({ data: userCreateData });
	} catch (err) {
		const isUnique =
			err instanceof Prisma.PrismaClientKnownRequestError &&
			err.code === 'P2002';

		if (isUnique) {
			const row = await prisma.user.findUnique({
				where: { id: authUserId },
			});
			if (row && row.email === emailTrimmed) {
				const profileData = registerDbProfileFromRequest(
					emailTrimmed,
					firstName,
					lastName,
					targetRole,
					phone,
				);
				try {
					await prisma.user.update({
						where: { id: authUserId },
						data: profileData,
					});
				} catch (updateErr) {
					console.error(
						'register: user.update failed after P2002',
						updateErr,
					);
					return sendJsonError(
						res,
						'Failed to complete user registration',
						500,
					);
				}
				return sendJsonSuccess(res, {
					user: data.user,
					session: data.session,
				});
			}
		}

		console.error(
			'register: Prisma user.create failed after signUp — orphan auth user may exist',
			err,
		);
		return sendJsonError(res, 'Failed to complete user registration', 500);
	}

	return sendJsonSuccess(res, {
		user: data.user,
		session: data.session,
	});
}

async function login(req: Request, res: Response) {
	const { email, password }: LoginBody = req.body;

	if (!email || !password) {
		return sendJsonError(res, 'Email and password required', 400);
	}

	const supabase = getSupabaseClient();

	const { data, error } = await supabase.auth.signInWithPassword({
		email,
		password,
	});

	if (error) {
		return sendJsonError(res, error.message, 401);
	}

	const accessToken = data.session?.access_token;
	const refreshToken = data.session?.refresh_token;

	if (!accessToken || !refreshToken) {
		return sendJsonError(res, 'Invalid auth session returned', 500);
	}

	res.cookie('refresh_token', refreshToken, {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'strict',
		path: '/auth/refresh',
		maxAge: 1000 * 60 * 60 * 24 * 30,
	});

	return sendJsonSuccess(res, {
		user: data.user,
		access_token: accessToken,
	});
}

async function refresh(req: Request, res: Response) {
	const refreshToken = (req as any).cookies?.refresh_token;

	if (!refreshToken) {
		return sendJsonError(res, 'Missing refresh token cookie', 401);
	}

	const supabase = getSupabaseClient();

	const { data, error } = await supabase.auth.refreshSession({
		refresh_token: refreshToken,
	});

	if (error) {
		return sendJsonError(res, error.message, 401);
	}

	const accessToken = data.session?.access_token;

	if (!accessToken) {
		return sendJsonError(res, 'Failed to refresh session', 500);
	}

	return sendJsonSuccess(res, {
		access_token: accessToken,
	});
}

async function logout(req: Request, res: Response) {
	res.clearCookie('refresh_token', {
		path: '/auth/refresh',
	});

	return sendJsonSuccess(res);
}

export { register, login, refresh, logout };
