import { Router } from 'express';
import {
	authMiddleware,
	requireMinRole,
	requireRole,
} from '../auth/auth.middleware';
import {
	deleteDrivingSchool,
	getDrivingSchools,
	createDrivingSchool,
	setDefaultDrivingSchool,
} from './driving-schools.controller';

function createDrivingSchoolsRouter() {
	const router = Router();

	router.get('/', authMiddleware, getDrivingSchools);
	router.post(
		'/',
		authMiddleware,
		requireMinRole('MANAGER'),
		createDrivingSchool,
	);

	router.patch(
		'/:id/set-default',
		authMiddleware,
		requireMinRole('MANAGER'),
		setDefaultDrivingSchool,
	);

	router.delete(
		'/:id',
		authMiddleware,
		requireMinRole('MANAGER'),
		deleteDrivingSchool,
	);

	return router;
}

export { createDrivingSchoolsRouter };
