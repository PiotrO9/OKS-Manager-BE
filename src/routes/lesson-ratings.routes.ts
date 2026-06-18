import { Router } from 'express';
import {
	listLessonRatingsHandler,
	listOwnLessonRatingsHandler,
} from '../controllers/lesson-rating.controller';
import { asyncHandler } from '../lib/http/asyncHandler';
import {
	authMiddleware,
	requireMinRole,
	requireRole,
} from '../middleware/auth.middleware';

function createLessonRatingsRouter() {
	const router = Router();

	router.get(
		'/',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(listLessonRatingsHandler),
	);

	router.get(
		'/me',
		authMiddleware,
		requireRole('INSTRUCTOR'),
		asyncHandler(listOwnLessonRatingsHandler),
	);

	return router;
}

export { createLessonRatingsRouter };
