import { Router } from 'express';
import {
	getInstructorById,
	listInstructorsBySchool,
} from '../controllers/instructors.controller';
import { asyncHandler } from '../lib/http/asyncHandler';
import { authMiddleware, requireMinRole } from '../middleware/auth.middleware';

function createInstructorsRouter() {
	const router = Router();

	router.get(
		'/',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(listInstructorsBySchool),
	);
	router.get(
		'/:id',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(getInstructorById),
	);

	return router;
}

export { createInstructorsRouter };
