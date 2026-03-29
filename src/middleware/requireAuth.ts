import { Request, Response, NextFunction } from 'express';
import { sendJsonError } from '../lib/apiResponse';
import { supabaseServerClient } from '../lib/supabase';

export async function requireAuth(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		const authHeader = req.headers.authorization as string | undefined;
		if (!authHeader?.startsWith('Bearer ')) {
			return sendJsonError(res, 'Brak tokena', 401);
		}
		const token = authHeader.split(' ')[1];

		const { data, error } = await supabaseServerClient.auth.getUser(token);
		if (error || !data?.user) {
			return sendJsonError(res, 'Nieprawidłowy token', 401);
		}

		// @ts-ignore
		req.user = data.user;
		return next();
	} catch (err) {
		// eslint-disable-next-line no-console
		console.error('Auth error', err);
		return sendJsonError(res, 'Błąd weryfikacji tokena', 500);
	}
}
