import type { Session, User } from '@supabase/supabase-js';
import { Request, Response } from 'express';
import { Prisma, Role } from '@prisma/client';
import { sendJsonError, sendJsonSuccess } from '../lib/apiResponse';
import { AppError } from '../lib/http/AppError';
import { requireUser } from '../lib/http/requireUser';
import { getPrisma } from '../lib/prisma';
import {
	attachInstructorToSchoolWithDefaultsInTx,
	validateInstructorRegistrationSchoolBeforeSignUp,
} from '../lib/instructorSchoolRegistration';
import {
	attachStudentToSchoolReplaceInTx,
	validateStudentRegistrationSchoolBeforeSignUp,
} from '../lib/studentSchoolRegistration';
import { canInvokerRegisterUserWithRole } from '../lib/registerRolePolicy';
import { getSupabaseClient } from '../lib/supabase';
import {
	logAuthSignUpError,
	mapAuthSignUpErrorForClient,
} from '../lib/supabaseSignUpErrors';
import { parseUuidParam } from '../lib/validation/uuid';
import { loadDrivingSchoolContextForMe } from '../services/meContext.service';
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
	/** Wymagane przy role === INSTRUCTOR; dla innych ról ignorowane. */
	schoolId?: string | null;
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

function registerDbFailureClientMessage(targetRole: Role): string {
	return targetRole === Role.INSTRUCTOR
		? 'Failed to create instructor'
		: 'Failed to complete user registration';
}

async function completeRegisterSuccessResponse(
	res: Response,
	targetRole: Role,
	authUserId: string,
	emailTrimmed: string,
	firstName: string,
	lastName: string,
	authPayload: { user: User; session: Session | null },
): Promise<Response> {
	if (targetRole !== Role.INSTRUCTOR) {
		return sendJsonSuccess(res, {
			user: authPayload.user,
			session: authPayload.session,
		});
	}

	const prisma = getPrisma();
	const profile = await prisma.instructorProfile.findUnique({
		where: { userId: authUserId },
		select: { id: true },
	});
	if (!profile) {
		console.error('register: instructor profile missing after success', {
			authUserId,
		});
		return sendJsonError(res, 'Failed to create instructor', 500);
	}

	const nameFromParts = [firstName, lastName]
		.map((s) => String(s).trim())
		.filter((s) => s.length > 0)
		.join(' ')
		.trim();

	return sendJsonSuccess(
		res,
		{
			instructor: {
				id: profile.id,
				userId: authUserId,
				name: nameFromParts || emailTrimmed,
				email: emailTrimmed,
			},
			user: authPayload.user,
			session: authPayload.session,
		},
		201,
	);
}

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

	let validatedInstructorSchoolId: string | undefined;
	if (targetRole === Role.INSTRUCTOR) {
		const rawSchool = body.schoolId;
		const hasExplicitSchool =
			rawSchool !== undefined &&
			rawSchool !== null &&
			String(rawSchool).trim() !== '';

		let resolvedSchoolId: string | null;

		if (hasExplicitSchool) {
			const schoolParse = parseUuidParam(body.schoolId);
			if (schoolParse === null || schoolParse === 'invalid') {
				return sendJsonError(res, 'Invalid schoolId', 400);
			}
			resolvedSchoolId = schoolParse;
		} else {
			resolvedSchoolId =
				actor.role === Role.MANAGER
					? (actor.defaultOskId ?? null)
					: null;
		}

		if (resolvedSchoolId === null) {
			return sendJsonError(
				res,
				actor.role === Role.MANAGER
					? 'Manager has no default school assigned'
					: 'schoolId is required when role is INSTRUCTOR',
				400,
			);
		}

		validatedInstructorSchoolId = resolvedSchoolId;
		try {
			await validateInstructorRegistrationSchoolBeforeSignUp(
				getPrisma(),
				actor.role,
				actor.id,
				emailTrimmed,
				validatedInstructorSchoolId,
			);
		} catch (err) {
			if (err instanceof AppError) {
				return sendJsonError(res, err.message, err.statusCode);
			}
			throw err;
		}
	}

	let validatedStudentSchoolId: string | undefined;
	if (targetRole === Role.STUDENT) {
		const prismaForSchool = getPrisma();
		const rawStudentSchool = body.schoolId;
		const hasExplicitStudentSchool =
			rawStudentSchool !== undefined &&
			rawStudentSchool !== null &&
			String(rawStudentSchool).trim() !== '';

		if (actor.role === Role.ADMIN) {
			if (hasExplicitStudentSchool) {
				const schoolParse = parseUuidParam(body.schoolId);
				if (schoolParse === null || schoolParse === 'invalid') {
					return sendJsonError(res, 'Invalid schoolId', 400);
				}
				try {
					await validateStudentRegistrationSchoolBeforeSignUp(
						prismaForSchool,
						actor.role,
						actor.id,
						schoolParse,
					);
				} catch (err) {
					if (err instanceof AppError) {
						return sendJsonError(res, err.message, err.statusCode);
					}
					throw err;
				}
				validatedStudentSchoolId = schoolParse;
			}
		} else if (actor.role === Role.MANAGER) {
			let resolvedStudentSchoolId: string | null;
			if (hasExplicitStudentSchool) {
				const schoolParse = parseUuidParam(body.schoolId);
				if (schoolParse === null || schoolParse === 'invalid') {
					return sendJsonError(res, 'Invalid schoolId', 400);
				}
				resolvedStudentSchoolId = schoolParse;
			} else {
				resolvedStudentSchoolId = actor.defaultOskId ?? null;
			}
			if (resolvedStudentSchoolId === null) {
				return sendJsonError(
					res,
					'Manager has no default school assigned',
					400,
				);
			}
			try {
				await validateStudentRegistrationSchoolBeforeSignUp(
					prismaForSchool,
					actor.role,
					actor.id,
					resolvedStudentSchoolId,
				);
			} catch (err) {
				if (err instanceof AppError) {
					return sendJsonError(res, err.message, err.statusCode);
				}
				throw err;
			}
			validatedStudentSchoolId = resolvedStudentSchoolId;
		} else if (actor.role === Role.INSTRUCTOR) {
			let resolvedStudentSchoolId: string | null = null;
			if (hasExplicitStudentSchool) {
				const schoolParse = parseUuidParam(body.schoolId);
				if (schoolParse === null || schoolParse === 'invalid') {
					return sendJsonError(res, 'Invalid schoolId', 400);
				}
				resolvedStudentSchoolId = schoolParse;
				try {
					await validateStudentRegistrationSchoolBeforeSignUp(
						prismaForSchool,
						actor.role,
						actor.id,
						resolvedStudentSchoolId,
					);
				} catch (err) {
					if (err instanceof AppError) {
						return sendJsonError(res, err.message, err.statusCode);
					}
					throw err;
				}
				validatedStudentSchoolId = resolvedStudentSchoolId;
			} else {
				const instructorLinks =
					await prismaForSchool.instructorSchool.findMany({
						where: {
							instructor: { userId: actor.id },
							school: { deletedAt: null },
						},
						select: { schoolId: true },
					});
				if (instructorLinks.length === 0) {
					return sendJsonError(
						res,
						'Instructor is not assigned to any school',
						400,
					);
				}
				if (instructorLinks.length > 1) {
					return sendJsonError(
						res,
						'schoolId is required when instructor belongs to multiple schools',
						400,
					);
				}
				resolvedStudentSchoolId = instructorLinks[0]!.schoolId;
				try {
					await validateStudentRegistrationSchoolBeforeSignUp(
						prismaForSchool,
						actor.role,
						actor.id,
						resolvedStudentSchoolId,
					);
				} catch (err) {
					if (err instanceof AppError) {
						return sendJsonError(res, err.message, err.statusCode);
					}
					throw err;
				}
				validatedStudentSchoolId = resolvedStudentSchoolId;
			}
		}
	}

	const supabase = getSupabaseClient();

	const { data, error } = await supabase.auth.signUp({
		email: emailTrimmed,
		password,
	});

	if (error) {
		logAuthSignUpError(error);
		const mapped = mapAuthSignUpErrorForClient(error);
		return sendJsonError(res, mapped.clientMessage, mapped.statusCode);
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
				if (
					targetRole === Role.INSTRUCTOR &&
					validatedInstructorSchoolId
				) {
					await attachInstructorToSchoolWithDefaultsInTx(
						tx,
						authUserId,
						validatedInstructorSchoolId,
					);
				}
				if (targetRole === Role.STUDENT && validatedStudentSchoolId) {
					await attachStudentToSchoolReplaceInTx(
						tx,
						authUserId,
						validatedStudentSchoolId,
					);
				}
			});
		} catch (err) {
			if (err instanceof AppError) {
				return sendJsonError(res, err.message, err.statusCode);
			}
			console.error('register: user.update failed (existingById)', err);
			return sendJsonError(
				res,
				registerDbFailureClientMessage(targetRole),
				500,
			);
		}

		if (!data.user) {
			console.error('register: missing user in signUp response');
			return sendJsonError(res, 'Registration incomplete', 500);
		}

		return completeRegisterSuccessResponse(
			res,
			targetRole,
			authUserId,
			emailTrimmed,
			firstName,
			lastName,
			{ user: data.user, session: data.session },
		);
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
		await prisma.$transaction(async (tx) => {
			await tx.user.create({ data: userCreateData });
			if (targetRole === Role.INSTRUCTOR && validatedInstructorSchoolId) {
				await attachInstructorToSchoolWithDefaultsInTx(
					tx,
					authUserId,
					validatedInstructorSchoolId,
				);
			}
			if (targetRole === Role.STUDENT && validatedStudentSchoolId) {
				await attachStudentToSchoolReplaceInTx(
					tx,
					authUserId,
					validatedStudentSchoolId,
				);
			}
		});
	} catch (err) {
		if (err instanceof AppError) {
			return sendJsonError(res, err.message, err.statusCode);
		}
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
						if (
							targetRole === Role.INSTRUCTOR &&
							validatedInstructorSchoolId
						) {
							await attachInstructorToSchoolWithDefaultsInTx(
								tx,
								authUserId,
								validatedInstructorSchoolId,
							);
						}
						if (
							targetRole === Role.STUDENT &&
							validatedStudentSchoolId
						) {
							await attachStudentToSchoolReplaceInTx(
								tx,
								authUserId,
								validatedStudentSchoolId,
							);
						}
					});
				} catch (updateErr) {
					if (updateErr instanceof AppError) {
						return sendJsonError(
							res,
							updateErr.message,
							updateErr.statusCode,
						);
					}
					console.error(
						'register: user.update failed after P2002',
						updateErr,
					);
					return sendJsonError(
						res,
						registerDbFailureClientMessage(targetRole),
						500,
					);
				}
				if (!data.user) {
					console.error('register: missing user in signUp response');
					return sendJsonError(res, 'Registration incomplete', 500);
				}

				return completeRegisterSuccessResponse(
					res,
					targetRole,
					authUserId,
					emailTrimmed,
					firstName,
					lastName,
					{ user: data.user, session: data.session },
				);
			}
		}

		console.error(
			'register: Prisma user.create failed after signUp — orphan auth user may exist',
			err,
		);
		return sendJsonError(
			res,
			registerDbFailureClientMessage(targetRole),
			500,
		);
	}

	if (!data.user) {
		console.error('register: missing user in signUp response');
		return sendJsonError(res, 'Registration incomplete', 500);
	}

	return completeRegisterSuccessResponse(
		res,
		targetRole,
		authUserId,
		emailTrimmed,
		firstName,
		lastName,
		{ user: data.user, session: data.session },
	);
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

async function buildMeResponsePayload(user: AuthRequestUser) {
	const context = await loadDrivingSchoolContextForMe(user.id, user.role);
	const base = {
		...buildMeUserPayload(user),
		...context,
	};
	if (user.role !== Role.STUDENT) {
		return base;
	}
	const prisma = getPrisma();
	const sp = await prisma.studentProfile.findUnique({
		where: { userId: user.id },
		select: { pkkNumber: true },
	});
	return {
		...base,
		pkkNumber: sp?.pkkNumber ?? null,
	};
}

async function getMe(req: Request, res: Response) {
	const user = req.user;
	if (!user) {
		return sendJsonError(res, 'Unauthorized', 401);
	}
	const payload = await buildMeResponsePayload(user);
	return sendJsonSuccess(res, { user: payload });
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
		user: await buildMeResponsePayload(updated),
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
