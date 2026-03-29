import { Request, Response, NextFunction } from 'express';
import { sendJsonError } from '../lib/apiResponse';
import { getPrisma } from '../lib/prisma';
import { getSupabaseClient } from '../lib/supabase';

const prisma = getPrisma();

function extractBearerToken(header: string | undefined): string | null {
	if (!header) {
		return null;
	}
	const m = header.match(/^Bearer\s+(.+)$/i);
	const raw = m?.[1]?.trim();
	return raw || null;
}

async function authMiddleware(req: Request, res: Response, next: NextFunction) {
	const token = extractBearerToken(req.headers.authorization);

	if (!token) {
		return sendJsonError(
			res,
			'Missing or invalid authorization header',
			401,
		);
	}

	if (token.split('.').length !== 3) {
		return sendJsonError(res, 'Invalid token format', 401);
	}

	try {
		const supabase = getSupabaseClient();
		const { data, error } = await supabase.auth.getUser(token);

		if (error || !data.user) {
			console.error(
				'Supabase getUser error:',
				error?.message ?? 'no user',
			);
			return sendJsonError(res, 'Invalid or expired token', 401);
		}

		const userId = data.user.id;

		const dbUser = await prisma.user.findUnique({
			where: { id: userId },
		});

		if (!dbUser) {
			return sendJsonError(res, 'User not found in DB', 401);
		}

		(req as any).user = dbUser;

		next();
	} catch (err) {
		console.error('Auth middleware error:', err);
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
	return function (req: Request, res: Response, next: NextFunction) {
		const user = (req as any).user;

		if (!user) {
			return sendJsonError(res, 'Unauthorized', 401);
		}

		const allowedRoles = Array.isArray(roles) ? roles : [roles];

		if (!allowedRoles.includes(user.role)) {
			return sendJsonError(res, 'Forbidden', 403);
		}

		next();
	};
}

function requireMinRole(minRole: string) {
	return function (req: Request, res: Response, next: NextFunction) {
		const user = (req as any).user;

		if (!user) {
			return sendJsonError(res, 'Unauthorized', 401);
		}

		const userLevel = ROLE_HIERARCHY[user.role];
		const requiredLevel = ROLE_HIERARCHY[minRole];

		if (!userLevel || !requiredLevel) {
			return sendJsonError(res, 'Role hierarchy misconfigured', 500);
		}

		if (userLevel < requiredLevel) {
			return sendJsonError(res, 'Forbidden', 403);
		}

		next();
	};
}

export { authMiddleware, requireRole, requireMinRole };
