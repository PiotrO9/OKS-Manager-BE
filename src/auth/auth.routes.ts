import { Router } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { register, login, refresh, logout } from './auth.controller';
import { authMiddleware } from './auth.middleware';

function createAuthRouter() {
	const router = Router();

	router.post('/register', authMiddleware, register);
	router.post('/login', login);
	router.post('/refresh', refresh);
	// Logout: Bearer (authMiddleware) + po stronie klienta credentials przy żądaniu,
	// inaczej przeglądarka nie zastosuje nagłówków kasujących ciasteczko refresh_token.
	router.post('/logout', authMiddleware, logout);

	router.get('/me', authMiddleware, (req, res) => {
		return sendJsonSuccess(res, {
			user: (req as any).user,
		});
	});

	return router;
}

export { createAuthRouter };
