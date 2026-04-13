import { Router } from 'express';
import {
	getEventHandler,
	getEventStudentsHandler,
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

	router.get(
		'/:id',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(getEventHandler),
	);

	router.patch(
		'/:id',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(patchEventHandler),
	);

	router.get(
		'/:id/students',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(getEventStudentsHandler),
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
