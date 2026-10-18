import { Request, Response } from 'express';
import { sendJsonError, sendJsonSuccess } from '../../lib/apiResponse';
import {
	getAccountSessionDecision,
	registerAccountSession,
	sessionIdFromToken,
} from '../../lib/accountSessions';
import { logger } from '../../lib/logger';
import { getPrisma } from '../../lib/prisma';
import {
	authenticatedAccountScopes,
	recordRequestSecurityEvent,
} from '../../lib/securityEventContext';
import { getSupabaseClient } from '../../lib/supabase';
import { resolveLoginTarget } from '../../services/security-events/record';
import {
	getRefreshTokenCookieOptions,
	readRefreshTokenCookie,
	REFRESH_TOKEN_COOKIE,
	REFRESH_TOKEN_COOKIE_PATH_LEGACY,
	REFRESH_TOKEN_MAX_AGE_MS,
} from './cookies';
import type { LoginBody } from './types';

async function loginTarget(email: string) {
	try {
		return await resolveLoginTarget(email);
	} catch (error) {
		logger.error('Login target could not be resolved for audit', { error });
		return { schoolScopes: [] };
	}
}

function loginErrorType(error: {
	code?: string;
}):
	| 'LOGIN_FAILED'
	| 'LOGIN_DENIED'
	| 'LOGIN_RATE_LIMITED'
	| 'LOGIN_PROVIDER_ERROR' {
	if (error.code === 'invalid_credentials') return 'LOGIN_FAILED';
	if (error.code === 'email_not_confirmed' || error.code === 'user_banned')
		return 'LOGIN_DENIED';
	if (
		error.code === 'over_request_rate_limit' ||
		error.code === 'over_email_send_rate_limit'
	)
		return 'LOGIN_RATE_LIMITED';
	return 'LOGIN_PROVIDER_ERROR';
}

export async function login(req: Request, res: Response) {
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
		const type = loginErrorType(error);
		const target = await loginTarget(email);
		await recordRequestSecurityEvent(req, {
			type,
			outcome:
				type === 'LOGIN_RATE_LIMITED' || type === 'LOGIN_DENIED'
					? 'DENIED'
					: 'FAILURE',
			reasonCode: error.code ?? 'AUTH_PROVIDER_ERROR',
			httpStatus: 401,
			loginIdentifier: email,
			targetUserId: target.targetUserId,
			targetDisplayName: target.targetDisplayName,
			schoolScopes: target.schoolScopes,
		});
		return sendJsonError(res, error.message, 401);
	}

	const accessToken = data.session?.access_token;
	const refreshToken = data.session?.refresh_token;

	if (!accessToken || !refreshToken) {
		await recordRequestSecurityEvent(req, {
			type: 'LOGIN_PROVIDER_ERROR',
			reasonCode: 'INCOMPLETE_AUTH_SESSION',
			httpStatus: 500,
			loginIdentifier: email,
		});
		return sendJsonError(res, 'Invalid auth session returned', 500);
	}

	const authUserId = data.user?.id;
	if (!authUserId) {
		await recordRequestSecurityEvent(req, {
			type: 'LOGIN_PROVIDER_ERROR',
			reasonCode: 'MISSING_AUTH_USER',
			httpStatus: 500,
			loginIdentifier: email,
		});
		return sendJsonError(res, 'Invalid auth session returned', 500);
	}

	const prisma = getPrisma();
	const dbUser = await prisma.user.findUnique({
		where: { id: authUserId },
	});

	if (!dbUser) {
		await recordRequestSecurityEvent(req, {
			type: 'LOGIN_DENIED',
			reasonCode: 'LOCAL_PROFILE_MISSING',
			httpStatus: 403,
			targetUserId: authUserId,
		});
		return sendJsonError(
			res,
			'User profile not found. Complete registration or contact support.',
			403,
		);
	}

	if (dbUser.deletedAt != null) {
		const target = await loginTarget(dbUser.email);
		await recordRequestSecurityEvent(req, {
			type: 'LOGIN_DENIED',
			reasonCode: 'ACCOUNT_ARCHIVED',
			httpStatus: 403,
			targetUserId: dbUser.id,
			targetDisplayName: target.targetDisplayName,
			schoolScopes: target.schoolScopes,
		});
		return sendJsonError(res, 'Account is no longer available', 403);
	}

	if (!dbUser.isActive) {
		const target = await loginTarget(dbUser.email);
		await recordRequestSecurityEvent(req, {
			type: 'LOGIN_DENIED',
			reasonCode: 'ACCOUNT_DISABLED',
			httpStatus: 403,
			targetUserId: dbUser.id,
			targetDisplayName: target.targetDisplayName,
			schoolScopes: target.schoolScopes,
		});
		return sendJsonError(res, 'Account is disabled', 403);
	}

	if (!dbUser.role) {
		const target = await loginTarget(dbUser.email);
		await recordRequestSecurityEvent(req, {
			type: 'LOGIN_DENIED',
			reasonCode: 'ACCOUNT_MISCONFIGURED',
			httpStatus: 500,
			targetUserId: dbUser.id,
			targetDisplayName: target.targetDisplayName,
			schoolScopes: target.schoolScopes,
		});
		return sendJsonError(res, 'User account is misconfigured', 500);
	}
	if (!(await registerAccountSession(authUserId, accessToken))) {
		const target = await loginTarget(dbUser.email);
		await recordRequestSecurityEvent(req, {
			type: 'LOGIN_DENIED',
			reasonCode: 'ACCOUNT_SESSION_NOT_REGISTERED',
			httpStatus: 403,
			targetUserId: dbUser.id,
			targetDisplayName: target.targetDisplayName,
			schoolScopes: target.schoolScopes,
		});
		return sendJsonError(res, 'Account is unavailable', 403);
	}

	res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
		...getRefreshTokenCookieOptions(),
		maxAge: REFRESH_TOKEN_MAX_AGE_MS,
	});
	const target = await loginTarget(dbUser.email);
	await recordRequestSecurityEvent(req, {
		type: 'LOGIN_SUCCEEDED',
		actorUserId: dbUser.id,
		actorRole: dbUser.role,
		actorDisplayName: `${dbUser.firstName} ${dbUser.lastName}`.trim(),
		targetUserId: dbUser.id,
		targetDisplayName: `${dbUser.firstName} ${dbUser.lastName}`.trim(),
		schoolScopes: target.schoolScopes.map((scope) => ({
			...scope,
			actorVisibility: 'KNOWN',
			actorUserId: dbUser.id,
			actorDisplayName: `${dbUser.firstName} ${dbUser.lastName}`.trim(),
			actorRole: dbUser.role,
		})),
		httpStatus: 200,
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

export async function refresh(req: Request, res: Response) {
	const refreshToken = readRefreshTokenCookie(req);

	if (!refreshToken) {
		await recordRequestSecurityEvent(req, {
			type: 'SESSION_REFRESH_FAILED',
			reasonCode: 'MISSING_REFRESH_COOKIE',
			httpStatus: 401,
		});
		return sendJsonError(res, 'Missing refresh token cookie', 401);
	}

	const supabase = getSupabaseClient();

	const { data, error } = await supabase.auth.refreshSession({
		refresh_token: refreshToken,
	});

	if (error) {
		await recordRequestSecurityEvent(req, {
			type: 'SESSION_REFRESH_FAILED',
			reasonCode: error.code ?? 'AUTH_PROVIDER_ERROR',
			httpStatus: 401,
		});
		return sendJsonError(res, error.message, 401);
	}

	const accessToken = data.session?.access_token;
	const nextRefreshToken = data.session?.refresh_token;

	if (!accessToken) {
		await recordRequestSecurityEvent(req, {
			type: 'SESSION_REFRESH_FAILED',
			reasonCode: 'INCOMPLETE_AUTH_SESSION',
			httpStatus: 500,
		});
		return sendJsonError(res, 'Failed to refresh session', 500);
	}
	const userId = data.user?.id;
	const dbUser = userId
		? await getPrisma().user.findUnique({
				where: { id: userId },
				select: {
					isActive: true,
					deletedAt: true,
					id: true,
					email: true,
					role: true,
					firstName: true,
					lastName: true,
				},
			})
		: null;
	const sessionDecision =
		userId && dbUser?.isActive && !dbUser.deletedAt
			? await getAccountSessionDecision(
					userId,
					sessionIdFromToken(accessToken),
				)
			: null;
	if (
		!userId ||
		!dbUser?.isActive ||
		dbUser.deletedAt ||
		!sessionDecision?.allowed
	) {
		const reasonCode = !userId
			? 'MISSING_AUTH_USER'
			: !dbUser
				? 'LOCAL_PROFILE_MISSING'
				: dbUser.deletedAt
					? 'ACCOUNT_ARCHIVED'
					: !dbUser.isActive
						? 'ACCOUNT_DISABLED'
						: (sessionDecision?.reason ?? 'UNKNOWN_SESSION');
		await recordRequestSecurityEvent(req, {
			type:
				reasonCode === 'REVOKED_SESSION'
					? 'REVOKED_SESSION_USED'
					: 'SESSION_REJECTED',
			reasonCode,
			actorUserId: userId,
			schoolScopes: dbUser
				? await authenticatedAccountScopes(dbUser)
				: [],
			httpStatus: 401,
		});
		res.clearCookie(REFRESH_TOKEN_COOKIE, getRefreshTokenCookieOptions());
		return sendJsonError(res, 'SESSION_REVOKED', 401);
	}

	if (nextRefreshToken) {
		res.cookie(REFRESH_TOKEN_COOKIE, nextRefreshToken, {
			...getRefreshTokenCookieOptions(),
			maxAge: REFRESH_TOKEN_MAX_AGE_MS,
		});
	}

	return sendJsonSuccess(res, {
		access_token: accessToken,
	});
}

export async function logout(req: Request, res: Response) {
	const userId = req.user?.id;
	let locallyRevoked = false;
	if (userId) {
		const sessionId = sessionIdFromToken(
			req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? '',
		);
		if (sessionId) {
			const result = await getPrisma().accountSession.updateMany({
				where: { userId, sessionId, revokedAt: null },
				data: { revokedAt: new Date() },
			});
			locallyRevoked = result.count > 0;
		}
	}
	const refreshToken = readRefreshTokenCookie(req);
	const cookieOpts = getRefreshTokenCookieOptions();

	if (refreshToken) {
		try {
			const supabase = getSupabaseClient();
			const { data, error } = await supabase.auth.refreshSession({
				refresh_token: refreshToken,
			});
			if (!error && data.session) {
				const { error: signOutError } = await supabase.auth.signOut({
					scope: 'local',
				});
				if (signOutError) {
					logger.error('logout: supabase signOut failed', {
						message: signOutError.message,
						requestId: req.requestId,
					});
					await recordRequestSecurityEvent(req, {
						type: 'LOGOUT_PROVIDER_REVOCATION_FAILED',
						actorUserId: userId,
						reasonCode: signOutError.code ?? 'AUTH_PROVIDER_ERROR',
						eventPhase: 'provider_revocation',
					});
				}
			}
		} catch (err) {
			logger.error('logout: supabase revoke failed', {
				error: err,
				requestId: req.requestId,
			});
			await recordRequestSecurityEvent(req, {
				type: 'LOGOUT_PROVIDER_REVOCATION_FAILED',
				actorUserId: userId,
				reasonCode: 'AUTH_PROVIDER_EXCEPTION',
				eventPhase: 'provider_revocation',
			});
		}
	}

	res.clearCookie(REFRESH_TOKEN_COOKIE, cookieOpts);
	res.clearCookie(REFRESH_TOKEN_COOKIE, {
		...cookieOpts,
		path: REFRESH_TOKEN_COOKIE_PATH_LEGACY,
	});
	await recordRequestSecurityEvent(req, {
		type: 'LOGOUT_SUCCEEDED',
		actorUserId: userId,
		actorRole: req.user?.role,
		actorDisplayName: req.user
			? `${req.user.firstName} ${req.user.lastName}`.trim()
			: undefined,
		schoolScopes: req.user
			? await authenticatedAccountScopes(req.user)
			: [],
		reasonCode: locallyRevoked
			? 'LOCAL_SESSION_REVOKED'
			: 'NO_ACTIVE_LOCAL_SESSION',
		eventPhase: 'local_logout',
		httpStatus: 200,
	});

	return sendJsonSuccess(res);
}
