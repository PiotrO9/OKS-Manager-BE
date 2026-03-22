import { Request, Response, NextFunction } from 'express';
import { supabaseServerClient } from '../lib/supabase';

export async function requireAuth(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		const authHeader = req.headers.authorization as string | undefined;
		if (!authHeader?.startsWith('Bearer ')) {
			return res.status(401).json({ error: 'Brak tokena' });
		}
		const token = authHeader.split(' ')[1];

		const { data, error } = await supabaseServerClient.auth.getUser(token);
		if (error || !data?.user) {
			return res.status(401).json({ error: 'Nieprawidłowy token' });
		}

		// @ts-ignore
		req.user = data.user;
		return next();
	} catch (err) {
		// eslint-disable-next-line no-console
		console.error('Auth error', err);
		return res.status(500).json({ error: 'Błąd weryfikacji tokena' });
	}
}
