import { Router } from 'express';
import multer from 'multer';
import {
	getMe,
	login,
	logout,
	patchProfile,
	refresh,
	register,
	uploadProfileAvatar,
} from '../controllers/auth.controller';
import { sendJsonError } from '../lib/apiResponse';
import { asyncHandler } from '../lib/http/asyncHandler';
import { authMiddleware } from '../middleware/auth.middleware';

const profileAvatarUpload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 5 * 1024 * 1024 },
});

function createAuthRouter() {
	const router = Router();

	router.post('/register', authMiddleware, register);
	router.post('/login', login);
	router.post('/refresh', refresh);
	// Logout: Bearer (authMiddleware) + po stronie klienta credentials przy żądaniu,
	// inaczej przeglądarka nie zastosuje nagłówków kasujących ciasteczko refresh_token.
	router.post('/logout', authMiddleware, logout);

	router.get('/me', authMiddleware, getMe);
	router.patch('/profile', authMiddleware, asyncHandler(patchProfile));
	router.post(
		'/profile/avatar',
		authMiddleware,
		(req, res, next) => {
			profileAvatarUpload.single('file')(req, res, (err: unknown) => {
				if (err instanceof multer.MulterError) {
					if (err.code === 'LIMIT_FILE_SIZE') {
						return sendJsonError(
							res,
							'file too large (max 5 MB)',
							400,
						);
					}
				}
				next(err);
			});
		},
		asyncHandler(uploadProfileAvatar),
	);

	return router;
}

export { createAuthRouter };
