import { Request, Response } from 'express';
import { Prisma, Role } from '@prisma/client';
import { sendJsonError, sendJsonSuccess } from '../lib/apiResponse';
import { AppError } from '../lib/http/AppError';
import { requireUser } from '../lib/http/requireUser';
import { getPrisma } from '../lib/prisma';
import { canInvokerRegisterUserWithRole } from '../lib/registerRolePolicy';
import { getSupabaseClient } from '../lib/supabase';
import {
	type PatchProfileInput,
	type UploadedPhotoFile,
	userProfileService,
} from '../services/userProfile.service';
import type { AuthRequestUser } from '../types/express';

const REFRESH_TOKEN_COOKIE = 'refresh_token';
/** Poprzednia wersja API (clearCookie musi dopasować path do skasowania). */
const REFRESH_TOKEN_COOKIE_PATH_LEGACY = '/auth/refresh';
const REFRESH_TOKEN_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

function getRefreshTokenCookieOptions() {
	return {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'strict' as const,
		path: '/auth',
	};
}

function readRefreshTokenCookie(req: Request): string | undefined {
	const raw = req.cookies?.[REFRESH_TOKEN_COOKIE];
	if (typeof raw !== 'string' || raw.trim() === '') {
		return undefined;
	}
	return raw;
}

type RegisterBody = {
	email: string;
	password: string;
	role: string;
	firstName: string;
	lastName: string;
	phone?: string | null;
	/** Wymagane przy role === INSTRUCTOR (profil w bazie wymaga numeru licencji). */
	licenseNumber?: string | null;
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

function instructorLicenseFromRegisterBody(
	body: RegisterBody,
	targetRole: Role,
): string | null {
	if (targetRole !== Role.INSTRUCTOR) {
		return null;
	}
	const raw = body.licenseNumber;
	if (raw === undefined || raw === null) {
		return null;
	}
	const trimmed = String(raw).trim();
	return trimmed === '' ? null : trimmed;
}

function buildUserCreateWithRoleProfiles(
	authUserId: string,
	profileFields: ReturnType<typeof registerDbProfileFromRequest>,
	targetRole: Role,
	instructorLicenseTrimmed: string | null,
): Prisma.UserCreateInput {
	const base: Prisma.UserCreateInput = {
		id: authUserId,
		...profileFields,
	};
	if (targetRole === Role.STUDENT) {
		return {
			...base,
			profile: { create: {} },
			studentProfile: { create: {} },
		};
	}
	return {
		...base,
		profile: { create: {} },
		instructorProfile: {
			create: { licenseNumber: instructorLicenseTrimmed! },
		},
	};
}

async function ensureRoleProfilesAfterUserUpsert(
	tx: Prisma.TransactionClient,
	userId: string,
	targetRole: Role,
	instructorLicenseTrimmed: string | null,
) {
	const user = await tx.user.findUnique({
		where: { id: userId },
		select: {
			profile: { select: { id: true } },
			studentProfile: { select: { id: true } },
			instructorProfile: { select: { id: true } },
		},
	});
	if (!user) {
		return;
	}

	if (!user.profile) {
		await tx.userProfile.create({ data: { userId } });
	}

	if (targetRole === Role.STUDENT && !user.studentProfile) {
		await tx.studentProfile.create({ data: { userId } });
	}

	if (targetRole === Role.INSTRUCTOR && !user.instructorProfile) {
		if (!instructorLicenseTrimmed) {
			throw new Error(
				'ensureRoleProfilesAfterUserUpsert: licenseNumber required for instructor',
			);
		}
		await tx.instructorProfile.create({
			data: { userId, licenseNumber: instructorLicenseTrimmed },
		});
	}
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

type RequestWithUser = Request & { user: AuthRequestUser };

async function register(req: Request, res: Response) {
	const actor = (req as RequestWithUser).user;
	const body: RegisterBody = req.body;
	const { email, password, role: roleRaw, firstName, lastName, phone } = body;

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

	const instructorLicenseTrimmed = instructorLicenseFromRegisterBody(
		body,
		targetRole,
	);
	if (targetRole === Role.INSTRUCTOR && !instructorLicenseTrimmed) {
		return sendJsonError(
			res,
			'licenseNumber is required when role is INSTRUCTOR',
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
			await prisma.$transaction(async (tx) => {
				await tx.user.update({
					where: { id: authUserId },
					data: profileData,
				});
				await ensureRoleProfilesAfterUserUpsert(
					tx,
					authUserId,
					targetRole,
					instructorLicenseTrimmed,
				);
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

	const profileFields = registerDbProfileFromRequest(
		emailTrimmed,
		firstName,
		lastName,
		targetRole,
		phone,
	);
	const userCreateData = buildUserCreateWithRoleProfiles(
		authUserId,
		profileFields,
		targetRole,
		instructorLicenseTrimmed,
	);

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
					await prisma.$transaction(async (tx) => {
						await tx.user.update({
							where: { id: authUserId },
							data: profileData,
						});
						await ensureRoleProfilesAfterUserUpsert(
							tx,
							authUserId,
							targetRole,
							instructorLicenseTrimmed,
						);
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

	const authUserId = data.user?.id;
	if (!authUserId) {
		return sendJsonError(res, 'Invalid auth session returned', 500);
	}

	const prisma = getPrisma();
	const dbUser = await prisma.user.findUnique({
		where: { id: authUserId },
	});

	if (!dbUser) {
		return sendJsonError(
			res,
			'User profile not found. Complete registration or contact support.',
			403,
		);
	}

	if (dbUser.deletedAt != null) {
		return sendJsonError(res, 'Account is no longer available', 403);
	}

	if (!dbUser.isActive) {
		return sendJsonError(res, 'Account is disabled', 403);
	}

	if (!dbUser.role) {
		return sendJsonError(res, 'User account is misconfigured', 500);
	}

	res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
		...getRefreshTokenCookieOptions(),
		maxAge: REFRESH_TOKEN_MAX_AGE_MS,
	});

	return sendJsonSuccess(res, {
		user: {
			id: dbUser.id,
			email: dbUser.email,
			firstName: dbUser.firstName,
			lastName: dbUser.lastName,
			role: dbUser.role,
			phone: dbUser.phone,
		},
		access_token: accessToken,
	});
}

async function refresh(req: Request, res: Response) {
	const refreshToken = readRefreshTokenCookie(req);

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

function buildMeUserPayload(user: AuthRequestUser) {
	const nameFromParts = [user.firstName, user.lastName]
		.map((s) => String(s).trim())
		.filter((s) => s.length > 0)
		.join(' ')
		.trim();

	return {
		id: user.id,
		name: nameFromParts || user.email,
		firstName: user.firstName,
		lastName: user.lastName,
		email: user.email,
		phone: user.phone,
		avatarUrl: user.profile?.avatarUrl ?? null,
		bio: user.profile?.bio ?? null,
		profileUpdatedAt: user.profile?.updatedAt ?? null,
		role: user.role,
	};
}

function getMe(req: Request, res: Response) {
	const user = req.user;
	if (!user) {
		return sendJsonError(res, 'Unauthorized', 401);
	}
	return sendJsonSuccess(res, { user: buildMeUserPayload(user) });
}

async function patchProfile(req: Request, res: Response) {
	const u = requireUser(req);
	const body = req.body as Record<string, unknown>;
	const wantsNameField =
		Object.prototype.hasOwnProperty.call(body, 'firstName') ||
		Object.prototype.hasOwnProperty.call(body, 'lastName');
	if (wantsNameField && u.role !== Role.MANAGER && u.role !== Role.ADMIN) {
		throw AppError.forbidden('Forbidden');
	}

	const patch: PatchProfileInput = {};
	if (Object.prototype.hasOwnProperty.call(body, 'bio')) {
		patch.bio = body.bio as string | null;
	}
	if (Object.prototype.hasOwnProperty.call(body, 'phone')) {
		patch.phone = body.phone as string | null;
	}
	if (Object.prototype.hasOwnProperty.call(body, 'firstName')) {
		patch.firstName = body.firstName as string;
	}
	if (Object.prototype.hasOwnProperty.call(body, 'lastName')) {
		patch.lastName = body.lastName as string;
	}
	await userProfileService.patchProfileForUser(u.id, patch);

	const prisma = getPrisma();
	const updated = await prisma.user.findUnique({
		where: { id: u.id },
		include: { profile: true },
	});
	if (!updated) {
		throw AppError.notFound('User not found');
	}

	return sendJsonSuccess(res, {
		ok: true,
		user: buildMeUserPayload(updated),
	});
}

async function uploadProfileAvatar(req: Request, res: Response) {
	const u = requireUser(req);
	const file = (req as Request & { file?: UploadedPhotoFile }).file;
	const data = await userProfileService.uploadAvatarForUser(
		u.id,
		file as UploadedPhotoFile,
	);
	return sendJsonSuccess(res, { photoUrl: data.avatarUrl });
}

/**
 * Wylogowanie — tylko dla użytkownika z ważnym tokenem (trasę chroni authMiddleware).
 *
 * Frontend: wywołanie musi iść z credentials (np. `fetch(..., { credentials: 'include' })`
 * albo axios `withCredentials: true`), żeby przeglądarka przyjęła `Set-Cookie` kasujące
 * ciasteczko `refresh_token`. Bez tego sesja odświeżania może zostać w przeglądarce.
 */
async function logout(req: Request, res: Response) {
	const refreshToken = readRefreshTokenCookie(req);
	const cookieOpts = getRefreshTokenCookieOptions();

	if (refreshToken) {
		try {
			const supabase = getSupabaseClient();
			const { data, error } = await supabase.auth.refreshSession({
				refresh_token: refreshToken,
			});
			if (!error && data.session) {
				const { error: signOutError } = await supabase.auth.signOut();
				if (signOutError) {
					console.error(
						'logout: supabase signOut failed',
						signOutError.message,
					);
				}
			}
		} catch (err) {
			console.error('logout: supabase revoke failed', err);
		}
	}

	res.clearCookie(REFRESH_TOKEN_COOKIE, cookieOpts);
	res.clearCookie(REFRESH_TOKEN_COOKIE, {
		...cookieOpts,
		path: REFRESH_TOKEN_COOKIE_PATH_LEGACY,
	});

	return sendJsonSuccess(res);
}

export {
	register,
	login,
	refresh,
	logout,
	getMe,
	patchProfile,
	uploadProfileAvatar,
};
