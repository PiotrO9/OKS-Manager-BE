import { Router } from 'express';
import { register, login, refresh, logout } from './auth.controller';
import { authMiddleware } from './auth.middleware';

function createAuthRouter() {
	const router = Router();

	router.post('/register', register);
	router.post('/login', login);
	router.post('/refresh', refresh);
	router.post('/logout', logout);

	router.get('/me', authMiddleware, (req, res) => {
		return res.json({
			user: (req as any).user,
		});
	});

	return router;
}

export { createAuthRouter };
