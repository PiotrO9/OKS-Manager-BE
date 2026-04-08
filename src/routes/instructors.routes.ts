import { Router } from 'express';
import {
	getInstructorById,
	listInstructorsBySchool,
	patchInstructor,
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
	router.patch(
		'/:id',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(patchInstructor),
	);

	return router;
}

export { createInstructorsRouter };
