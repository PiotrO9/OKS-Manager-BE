import { Router } from 'express';
import {
	getMeHandler,
	getScheduleHandler,
	postScheduleAvailabilityCheckHandler,
	postScheduleAvailabilityOptionsHandler,
} from '../controllers/schedule.controller';
import { asyncHandler } from '../lib/http/asyncHandler';
import { authMiddleware, requireMinRole } from '../middleware/auth.middleware';

function createScheduleRouter() {
	const router = Router();

	router.get('/me', authMiddleware, asyncHandler(getMeHandler));

	router.post(
		'/availability-check',
		authMiddleware,
		asyncHandler(postScheduleAvailabilityCheckHandler),
	);

	router.post(
		'/availability-options',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(postScheduleAvailabilityOptionsHandler),
	);

	router.get(
		'/',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(getScheduleHandler),
	);

	return router;
}

export { createScheduleRouter };
