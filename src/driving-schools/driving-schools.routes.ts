import { Router } from 'express';
import { authMiddleware, requireMinRole } from '../auth/auth.middleware';
import {
	deleteDrivingSchool,
	getDrivingSchools,
	getDefaultDrivingSchool,
	createDrivingSchool,
	setDefaultDrivingSchool,
	updateDrivingSchool,
} from './driving-schools.controller';

function createDrivingSchoolsRouter() {
	const router = Router();

	router.get('/', authMiddleware, getDrivingSchools);
	router.get('/default', authMiddleware, getDefaultDrivingSchool);
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

	router.patch(
		'/:id',
		authMiddleware,
		requireMinRole('MANAGER'),
		updateDrivingSchool,
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
