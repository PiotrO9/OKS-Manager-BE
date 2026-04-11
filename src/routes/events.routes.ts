import { Router } from 'express';
import { postEventHandler } from '../controllers/event.controller';
import { asyncHandler } from '../lib/http/asyncHandler';
import { authMiddleware, requireMinRole } from '../middleware/auth.middleware';

function createEventsRouter() {
	const router = Router();

	router.post(
		'/',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(postEventHandler),
	);

	return router;
}

export { createEventsRouter };
