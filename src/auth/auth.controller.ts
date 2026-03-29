import { Request, Response } from 'express';
import { sendJsonError, sendJsonSuccess } from '../lib/apiResponse';
import { getSupabaseClient } from '../lib/supabase';

type RegisterBody = {
	email: string;
	password: string;
};

type LoginBody = {
	email: string;
	password: string;
};

async function register(req: Request, res: Response) {
	const { email, password }: RegisterBody = req.body;

	if (!email || !password) {
		return sendJsonError(res, 'Email and password required', 400);
	}

	const supabase = getSupabaseClient();

	const { data, error } = await supabase.auth.signUp({
		email,
		password,
	});

	if (error) {
		return sendJsonError(res, error.message, 400);
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
