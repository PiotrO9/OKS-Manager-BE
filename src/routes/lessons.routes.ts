import { Router } from 'express';
import {
	cancelOwnLessonHandler,
	getLessonHandler,
	getLessonRatingHandler,
	patchLessonHandler,
	postLessonHandler,
	postOwnLessonHandler,
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
		'/me',
		authMiddleware,
		requireRole('STUDENT'),
		asyncHandler(postOwnLessonHandler),
	);

	router.patch(
		'/:lessonId/cancel',
		authMiddleware,
		requireRole('STUDENT'),
		asyncHandler(cancelOwnLessonHandler),
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
