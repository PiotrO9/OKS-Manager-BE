import { Router } from 'express';
import {
	assignInstructorToSchool,
	deleteInstructor,
	getInstructorById,
	listInstructorsBySchool,
	patchInstructor,
} from '../controllers/instructors.controller';
import { asyncHandler } from '../lib/http/asyncHandler';
import { authMiddleware, requireMinRole } from '../middleware/auth.middleware';
import { createInstructorAvailabilityRouter } from './instructor-availability.routes';

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
	router.post(
		'/:id/schools',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(assignInstructorToSchool),
	);
	router.patch(
		'/:id',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(patchInstructor),
	);
	router.delete(
		'/:id',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(deleteInstructor),
	);

	router.use(
		'/:instructorId/availability',
		createInstructorAvailabilityRouter(),
	);

	return router;
}

export { createInstructorsRouter };
