import { Router } from 'express';
import {
	patchStudentDrivingSchool,
	patchStudentPkk,
} from '../controllers/students.controller';
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

	router.patch(
		'/:userId/pkk',
		authMiddleware,
		requireMinRole('INSTRUCTOR'),
		asyncHandler(patchStudentPkk),
	);

	return router;
}

export { createStudentsRouter };
