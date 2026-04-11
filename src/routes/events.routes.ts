import { Router } from 'express';
import {
	postEventHandler,
	postEventStudentsHandler,
} from '../controllers/event.controller';
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

	router.post(
		'/:id/students',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(postEventStudentsHandler),
	);

	return router;
}

export { createEventsRouter };
