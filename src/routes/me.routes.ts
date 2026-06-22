import { Router } from 'express';
import { listMyCourses, listMyPayments } from '../controllers/me.controller';
import { asyncHandler } from '../lib/http/asyncHandler';
import { authMiddleware } from '../middleware/auth.middleware';

function createMeRouter() {
	const router = Router();

	router.get('/courses', authMiddleware, asyncHandler(listMyCourses));
	router.get('/payments', authMiddleware, asyncHandler(listMyPayments));

	return router;
}

export { createMeRouter };
