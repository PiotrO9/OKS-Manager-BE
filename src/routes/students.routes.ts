import { Router } from 'express';
import { patchStudentDrivingSchool } from '../controllers/students.controller';
import { asyncHandler } from '../lib/http/asyncHandler';
import { authMiddleware, requireMinRole } from '../middleware/auth.middleware';

function createStudentsRouter() {
	const router = Router();

	router.patch(
		'/:userId/driving-school',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(patchStudentDrivingSchool),
	);

	return router;
}

export { createStudentsRouter };
