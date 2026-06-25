import type { Request } from 'express';

export const REFRESH_TOKEN_COOKIE = 'refresh_token';
export const REFRESH_TOKEN_COOKIE_PATH_LEGACY = '/auth/refresh';
export const REFRESH_TOKEN_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

export function getRefreshTokenCookieOptions() {
	return {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'strict' as const,
		path: '/auth',
	};
}

export function readRefreshTokenCookie(req: Request): string | undefined {
	const raw = req.cookies?.[REFRESH_TOKEN_COOKIE];
	if (typeof raw !== 'string' || raw.trim() === '') {
		return undefined;
	}
	return raw;
}
