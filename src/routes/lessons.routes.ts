import { Router } from 'express';
import {
	patchLessonHandler,
	postLessonHandler,
} from '../controllers/lesson.controller';
import { asyncHandler } from '../lib/http/asyncHandler';
import { authMiddleware, requireMinRole } from '../middleware/auth.middleware';

function createLessonsRouter() {
	const router = Router();

	router.post(
		'/',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(postLessonHandler),
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
