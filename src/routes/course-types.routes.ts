import { Router } from 'express';
import { getCourseTypes } from '../controllers/course-types.controller';
import { authMiddleware, requireMinRole } from '../middleware/auth.middleware';
import { asyncHandler } from '../lib/http/asyncHandler';

function createCourseTypesRouter() {
	const router = Router();

	router.get(
		'/',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(getCourseTypes),
	);

	return router;
}

export { createCourseTypesRouter };
