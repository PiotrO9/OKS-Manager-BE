import { Router } from 'express';
import {
	getMeHandler,
	getScheduleHandler,
} from '../controllers/schedule.controller';
import { asyncHandler } from '../lib/http/asyncHandler';
import { authMiddleware, requireMinRole } from '../middleware/auth.middleware';

function createScheduleRouter() {
	const router = Router();

	router.get('/me', authMiddleware, asyncHandler(getMeHandler));

	router.get(
		'/',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(getScheduleHandler),
	);

	return router;
}

export { createScheduleRouter };
