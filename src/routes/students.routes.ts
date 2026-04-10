import { Router } from 'express';
import {
	assignStudentToCourse,
	getStudentDetail,
	listStudents,
	patchCourseParticipantStatus,
	patchStudent,
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

	router.get(
		'/:userId',
		authMiddleware,
		requireMinRole('STUDENT'),
		asyncHandler(getStudentDetail),
	);

	router.patch(
		'/:userId',
		authMiddleware,
		requireMinRole('INSTRUCTOR'),
		asyncHandler(patchStudent),
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

	router.patch(
		'/:userId/courses/:courseId/status',
		authMiddleware,
		requireMinRole('INSTRUCTOR'),
		asyncHandler(patchCourseParticipantStatus),
	);

	return router;
}

export { createStudentsRouter };
