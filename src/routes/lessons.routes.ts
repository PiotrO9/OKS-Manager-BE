import { Router } from 'express';
import {
	getLessonHandler,
	getLessonRatingHandler,
	patchLessonHandler,
	postLessonHandler,
	postLessonRatingHandler,
} from '../controllers/lesson.controller';
import { asyncHandler } from '../lib/http/asyncHandler';
import {
	authMiddleware,
	requireMinRole,
	requireRole,
} from '../middleware/auth.middleware';

function createLessonsRouter() {
	const router = Router();

	router.post(
		'/',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(postLessonHandler),
	);

	router.post(
		'/:lessonId/rating',
		authMiddleware,
		requireRole('STUDENT'),
		asyncHandler(postLessonRatingHandler),
	);

	router.get(
		'/:lessonId/rating',
		authMiddleware,
		requireRole('STUDENT'),
		asyncHandler(getLessonRatingHandler),
	);

	router.get(
		'/:id',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(getLessonHandler),
	);

	router.patch(
		'/:id',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(patchLessonHandler),
	);

	return router;
}

export { createLessonsRouter };
