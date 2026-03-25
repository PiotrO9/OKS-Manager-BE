import { Request, Response, NextFunction } from 'express';
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
		return res
			.status(401)
			.json({ error: 'Missing or invalid authorization header' });
	}

	if (token.split('.').length !== 3) {
		return res.status(401).json({ error: 'Invalid token format' });
	}

	try {
		const supabase = getSupabaseClient();
		const { data, error } = await supabase.auth.getUser(token);

		if (error || !data.user) {
			console.error('Supabase getUser error:', error?.message ?? 'no user');
			return res.status(401).json({ error: 'Invalid or expired token' });
		}

		const userId = data.user.id;

		const dbUser = await prisma.user.findUnique({
			where: { id: userId },
		});

		if (!dbUser) {
			return res.status(401).json({ error: 'User not found in DB' });
		}

		(req as any).user = dbUser;

		next();
	} catch (err) {
		console.error('Auth middleware error:', err);
		return res.status(401).json({ error: 'Invalid or expired token' });
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
			return res.status(401).json({ error: 'Unauthorized' });
		}

		const allowedRoles = Array.isArray(roles) ? roles : [roles];

		if (!allowedRoles.includes(user.role)) {
			return res.status(403).json({ error: 'Forbidden' });
		}

		next();
	};
}

function requireMinRole(minRole: string) {
	return function (req: Request, res: Response, next: NextFunction) {
		const user = (req as any).user;

		if (!user) {
			return res.status(401).json({ error: 'Unauthorized' });
		}

		const userLevel = ROLE_HIERARCHY[user.role];
		const requiredLevel = ROLE_HIERARCHY[minRole];

		if (!userLevel || !requiredLevel) {
			return res
				.status(500)
				.json({ error: 'Role hierarchy misconfigured' });
		}

		if (userLevel < requiredLevel) {
			return res.status(403).json({ error: 'Forbidden' });
		}

		next();
	};
}

export { authMiddleware, requireRole, requireMinRole };
