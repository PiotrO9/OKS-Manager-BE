import { Router } from 'express';
import { createCourse } from '../controllers/courses.controller';
import { asyncHandler } from '../lib/http/asyncHandler';
import { authMiddleware, requireMinRole } from '../middleware/auth.middleware';

function createCoursesRouter() {
	const router = Router();

	router.post(
		'/',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(createCourse),
	);

	return router;
}

export { createCoursesRouter };
