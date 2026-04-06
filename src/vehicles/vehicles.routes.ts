import { Router } from 'express';
import { authMiddleware, requireMinRole } from '../auth/auth.middleware';
import {
	deleteVehicle,
	listVehiclesBySchool,
	updateVehicle,
	upsertVehicle,
} from './vehicles.controller';

function createVehiclesRouter() {
	const router = Router();

	router.get(
		'/',
		authMiddleware,
		requireMinRole('MANAGER'),
		listVehiclesBySchool,
	);
	router.post('/', authMiddleware, requireMinRole('MANAGER'), upsertVehicle);
	router.patch(
		'/:id',
		authMiddleware,
		requireMinRole('MANAGER'),
		updateVehicle,
	);
	router.delete(
		'/:id',
		authMiddleware,
		requireMinRole('MANAGER'),
		deleteVehicle,
	);

	return router;
}

export { createVehiclesRouter };
