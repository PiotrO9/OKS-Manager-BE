import { Router } from 'express';
import {
	getMe,
	login,
	logout,
	refresh,
	register,
} from '../controllers/auth.controller';
import { authMiddleware } from '../middleware/auth.middleware';

function createAuthRouter() {
	const router = Router();

	router.post('/register', authMiddleware, register);
	router.post('/login', login);
	router.post('/refresh', refresh);
	// Logout: Bearer (authMiddleware) + po stronie klienta credentials przy żądaniu,
	// inaczej przeglądarka nie zastosuje nagłówków kasujących ciasteczko refresh_token.
	router.post('/logout', authMiddleware, logout);

	router.get('/me', authMiddleware, getMe);

	return router;
}

export { createAuthRouter };
