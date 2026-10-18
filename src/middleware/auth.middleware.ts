import { Request, Response, NextFunction } from 'express';
import { sendJsonError } from '../lib/apiResponse';
import {
	getAccountSessionDecision,
	sessionIdFromToken,
} from '../lib/accountSessions';
import { logger } from '../lib/logger';
import { getPrisma } from '../lib/prisma';
import {
	actorSchoolScopes,
	authenticatedAccountScopes,
	recordRequestSecurityEvent,
} from '../lib/securityEventContext';
import { getSupabaseClient } from '../lib/supabase';

const prisma = getPrisma();

function extractBearerToken(header: string | undefined): string | null {
	if (!header) {
		return null;
	}
	const bearerMatch = header.match(/^Bearer\s+(.+)$/i);
	const rawToken = bearerMatch?.[1]?.trim();
	return rawToken || null;
}

async function authMiddleware(req: Request, res: Response, next: NextFunction) {
	const token = extractBearerToken(req.headers.authorization);

	if (!token) {
		await recordRequestSecurityEvent(req, {
			type: 'AUTHENTICATION_REQUIRED',
			reasonCode: 'MISSING_BEARER_TOKEN',
			eventPhase: 'access_decision',
			httpStatus: 401,
		});
		return sendJsonError(
			res,
			'Missing or invalid authorization header',
			401,
		);
	}

	if (token.split('.').length !== 3) {
		await recordRequestSecurityEvent(req, {
			type: 'SESSION_REJECTED',
			reasonCode: 'MALFORMED_TOKEN',
			eventPhase: 'access_decision',
			httpStatus: 401,
		});
		return sendJsonError(res, 'Invalid token format', 401);
	}

	try {
		const supabase = getSupabaseClient();
		const { data, error } = await supabase.auth.getClaims(token);
		const userId = data?.claims.sub;

		if (error || !userId) {
			logger.error('Supabase getClaims error', {
				message: error?.message ?? 'no user',
				requestId: req.requestId,
			});
			await recordRequestSecurityEvent(req, {
				type: 'SESSION_REJECTED',
				reasonCode: 'INVALID_TOKEN',
				eventPhase: 'access_decision',
				httpStatus: 401,
			});
			return sendJsonError(res, 'Invalid or expired token', 401);
		}

		const dbUser = await prisma.user.findUnique({
			where: { id: userId },
			include: { profile: true },
		});

		if (!dbUser) {
			await recordRequestSecurityEvent(req, {
				type: 'SESSION_REJECTED',
				reasonCode: 'LOCAL_PROFILE_MISSING',
				eventPhase: 'access_decision',
				targetUserId: userId,
				httpStatus: 404,
			});
			return sendJsonError(res, 'Użytkownik nie istnieje', 404);
		}

		if (dbUser.deletedAt != null) {
			await recordRequestSecurityEvent(req, {
				type: 'SESSION_REJECTED',
				reasonCode: 'ACCOUNT_ARCHIVED',
				eventPhase: 'access_decision',
				actorUserId: userId,
				schoolScopes: await authenticatedAccountScopes(dbUser),
				httpStatus: 403,
			});
			return sendJsonError(res, 'Account is no longer available', 403);
		}

		if (!dbUser.isActive) {
			await recordRequestSecurityEvent(req, {
				type: 'SESSION_REJECTED',
				reasonCode: 'ACCOUNT_DISABLED',
				eventPhase: 'access_decision',
				actorUserId: userId,
				schoolScopes: await authenticatedAccountScopes(dbUser),
				httpStatus: 403,
			});
			return sendJsonError(res, 'Account is disabled', 403);
		}
		const sessionDecision = await getAccountSessionDecision(
			userId,
			sessionIdFromToken(token),
		);
		if (!sessionDecision.allowed) {
			await recordRequestSecurityEvent(req, {
				type:
					sessionDecision.reason === 'REVOKED_SESSION'
						? 'REVOKED_SESSION_USED'
						: 'SESSION_REJECTED',
				reasonCode: sessionDecision.reason,
				eventPhase: 'access_decision',
				actorUserId: userId,
				schoolScopes: await authenticatedAccountScopes(dbUser),
				httpStatus: 401,
			});
			return sendJsonError(res, 'SESSION_REVOKED', 401);
		}

		req.user = dbUser;

		next();
	} catch (err) {
		logger.error('Auth middleware error', {
			error: err,
			requestId: req.requestId,
		});
		await recordRequestSecurityEvent(req, {
			type: 'SESSION_REJECTED',
			reasonCode: 'AUTH_CHECK_FAILED',
			eventPhase: 'access_decision',
			httpStatus: 401,
		});
		return sendJsonError(res, 'Invalid or expired token', 401);
	}
}

const ROLE_HIERARCHY: Record<string, number> = {
	STUDENT: 1,
	INSTRUCTOR: 2,
	MANAGER: 3,
	ADMIN: 4,
};

function requireRole(roles: string | string[]) {
	return async function (req: Request, res: Response, next: NextFunction) {
		const user = req.user;

		if (!user) {
			await recordRequestSecurityEvent(req, {
				type: 'AUTHENTICATION_REQUIRED',
				reasonCode: 'MISSING_AUTHENTICATED_USER',
				eventPhase: 'access_decision',
				httpStatus: 401,
			});
			return sendJsonError(res, 'Unauthorized', 401);
		}

		const allowedRoles = Array.isArray(roles) ? roles : [roles];

		if (!allowedRoles.includes(user.role)) {
			await recordRequestSecurityEvent(req, {
				type: 'ACCESS_DENIED',
				actorUserId: user.id,
				actorRole: user.role,
				actorDisplayName: `${user.firstName} ${user.lastName}`.trim(),
				reasonCode: 'ROLE_NOT_ALLOWED',
				eventPhase: 'access_decision',
				httpStatus: 403,
				schoolScopes: await actorSchoolScopes(req),
			});
			return sendJsonError(res, 'Forbidden', 403);
		}

		next();
	};
}

function requireMinRole(minRole: string) {
	return async function (req: Request, res: Response, next: NextFunction) {
		const user = req.user;

		if (!user) {
			await recordRequestSecurityEvent(req, {
				type: 'AUTHENTICATION_REQUIRED',
				reasonCode: 'MISSING_AUTHENTICATED_USER',
				eventPhase: 'access_decision',
				httpStatus: 401,
			});
			return sendJsonError(res, 'Unauthorized', 401);
		}

		const userLevel = ROLE_HIERARCHY[user.role];
		const requiredLevel = ROLE_HIERARCHY[minRole];

		if (!userLevel || !requiredLevel) {
			return sendJsonError(res, 'Role hierarchy misconfigured', 500);
		}

		if (userLevel < requiredLevel) {
			await recordRequestSecurityEvent(req, {
				type: 'ACCESS_DENIED',
				actorUserId: user.id,
				actorRole: user.role,
				actorDisplayName: `${user.firstName} ${user.lastName}`.trim(),
				reasonCode: 'ROLE_BELOW_REQUIRED',
				eventPhase: 'access_decision',
				httpStatus: 403,
				schoolScopes: await actorSchoolScopes(req),
			});
			return sendJsonError(res, 'Forbidden', 403);
		}

		next();
	};
}

export { authMiddleware, requireRole, requireMinRole };
