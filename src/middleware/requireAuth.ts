import { Request, Response, NextFunction } from 'express';
import { sendJsonError } from '../lib/apiResponse';
import { getPrisma } from '../lib/prisma';
import { supabaseServerClient } from '../lib/supabase';

const prisma = getPrisma();

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

		const dbUser = await prisma.user.findUnique({
			where: { id: data.user.id },
		});
		if (!dbUser) {
			return sendJsonError(res, 'Użytkownik nie istnieje w bazie', 401);
		}

		req.user = dbUser;
		return next();
	} catch (err) {
		// eslint-disable-next-line no-console
		console.error('Auth error', err);
		return sendJsonError(res, 'Błąd weryfikacji tokena', 500);
	}
}
