import { Request, Response } from 'express';
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
		return res.status(400).json({ error: 'Email and password required' });
	}

	const supabase = getSupabaseClient();

	const { data, error } = await supabase.auth.signUp({
		email,
		password,
	});

	if (error) {
		return res.status(400).json({ error: error.message });
	}

	return res.json({
		user: data.user,
		session: data.session,
	});
}

async function login(req: Request, res: Response) {
	const { email, password }: LoginBody = req.body;

	if (!email || !password) {
		return res.status(400).json({ error: 'Email and password required' });
	}

	const supabase = getSupabaseClient();

	const { data, error } = await supabase.auth.signInWithPassword({
		email,
		password,
	});

	if (error) {
		return res.status(401).json({ error: error.message });
	}

	const accessToken = data.session?.access_token;
	const refreshToken = data.session?.refresh_token;

	if (!accessToken || !refreshToken) {
		return res.status(500).json({ error: 'Invalid auth session returned' });
	}

	res.cookie('refresh_token', refreshToken, {
		httpOnly: true,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'strict',
		path: '/auth/refresh',
		maxAge: 1000 * 60 * 60 * 24 * 30
	});

	return res.json({
		user: data.user,
		access_token: accessToken
	});
}

async function refresh(req: Request, res: Response) {
  const refreshToken = (req as any).cookies?.refresh_token

  if (!refreshToken) {
    return res.status(401).json({ error: 'Missing refresh token cookie' })
  }

  const supabase = getSupabaseClient()

  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refreshToken
  })

  if (error) {
    return res.status(401).json({ error: error.message })
  }

  const accessToken = data.session?.access_token

  if (!accessToken) {
    return res.status(500).json({ error: 'Failed to refresh session' })
  }

  return res.json({
    access_token: accessToken
  })
}

async function logout(req: Request, res: Response) {
  res.clearCookie('refresh_token', {
    path: '/auth/refresh'
  })

  return res.json({ success: true })
}

export { register, login, refresh, logout };
