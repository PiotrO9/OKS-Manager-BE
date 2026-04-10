import { Router } from 'express';
import {
	assignStudentToCourse,
	listStudents,
	patchStudentDrivingSchool,
	patchStudentPkk,
} from '../controllers/students.controller';
import { asyncHandler } from '../lib/http/asyncHandler';
import { authMiddleware, requireMinRole } from '../middleware/auth.middleware';

function createStudentsRouter() {
	const router = Router();

	router.get(
		'/',
		authMiddleware,
		requireMinRole('INSTRUCTOR'),
		asyncHandler(listStudents),
	);

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

	router.post(
		'/:userId/courses',
		authMiddleware,
		requireMinRole('INSTRUCTOR'),
		asyncHandler(assignStudentToCourse),
	);

	return router;
}

export { createStudentsRouter };
