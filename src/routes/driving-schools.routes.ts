import { Router } from 'express';
import {
	createDrivingSchool,
	deleteDrivingSchool,
	getDefaultDrivingSchool,
	getDrivingSchools,
	getSchoolAvailabilitySlots,
	setDefaultDrivingSchool,
	setDefaultVehicleForDrivingSchool,
	updateDrivingSchool,
} from '../controllers/driving-schools.controller';
import { authMiddleware, requireMinRole } from '../middleware/auth.middleware';
import { asyncHandler } from '../lib/http/asyncHandler';

function createDrivingSchoolsRouter() {
	const router = Router();

	router.get('/', authMiddleware, asyncHandler(getDrivingSchools));
	router.get(
		'/default',
		authMiddleware,
		asyncHandler(getDefaultDrivingSchool),
	);

	router.get(
		'/:id/availability/slots',
		authMiddleware,
		asyncHandler(getSchoolAvailabilitySlots),
	);
	router.post(
		'/',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(createDrivingSchool),
	);

	router.patch(
		'/:id/set-default',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(setDefaultDrivingSchool),
	);

	router.patch(
		'/:id/default-vehicle',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(setDefaultVehicleForDrivingSchool),
	);

	router.patch(
		'/:id',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(updateDrivingSchool),
	);

	router.delete(
		'/:id',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(deleteDrivingSchool),
	);

	return router;
}

export { createDrivingSchoolsRouter };
