import { Request, Response } from 'express';
import { sendJsonError, sendJsonSuccess } from '../../lib/apiResponse';
import { getPrisma } from '../../lib/prisma';
import { getSupabaseClient } from '../../lib/supabase';
import {
	getRefreshTokenCookieOptions,
	readRefreshTokenCookie,
	REFRESH_TOKEN_COOKIE,
	REFRESH_TOKEN_COOKIE_PATH_LEGACY,
	REFRESH_TOKEN_MAX_AGE_MS,
} from './cookies';
import type { LoginBody } from './types';

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

export async function refresh(req: Request, res: Response) {
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
	const nextRefreshToken = data.session?.refresh_token;

	if (!accessToken) {
		return sendJsonError(res, 'Failed to refresh session', 500);
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
