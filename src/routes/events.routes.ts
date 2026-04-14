import { Router } from 'express';
import {
	deleteEventHandler,
	deleteEventStudentsHandler,
	getEventEligibleStudentsHandler,
	getEventHandler,
	getEventStudentsHandler,
	patchEventHandler,
	postEventHandler,
	postEventStudentsHandler,
	putEventStudentsHandler,
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
		'/:id/eligible-students',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(getEventEligibleStudentsHandler),
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

	router.delete(
		'/:id',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(deleteEventHandler),
	);

	router.get(
		'/:id/students',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(getEventStudentsHandler),
	);

	router.put(
		'/:id/students',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(putEventStudentsHandler),
	);

	router.delete(
		'/:id/students/:studentUserId',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(deleteEventStudentsHandler),
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
