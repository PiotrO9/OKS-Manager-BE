import { Router } from 'express';
import {
	createCourse,
	getCourseById,
	listCourses,
} from '../controllers/courses.controller';
import { asyncHandler } from '../lib/http/asyncHandler';
import { authMiddleware, requireMinRole } from '../middleware/auth.middleware';

function createCoursesRouter() {
	const router = Router();

	router.get(
		'/',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(listCourses),
	);

	router.get(
		'/:id',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(getCourseById),
	);

	router.post(
		'/',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(createCourse),
	);

	return router;
}

export { createCoursesRouter };
