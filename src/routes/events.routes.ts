import { Router } from 'express';
import {
	patchEventHandler,
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

	router.patch(
		'/:id',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(patchEventHandler),
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
