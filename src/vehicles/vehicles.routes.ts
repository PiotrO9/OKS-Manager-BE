import { Router } from 'express';
import { authMiddleware, requireMinRole } from '../auth/auth.middleware';
import { upsertVehicle } from './vehicles.controller';

function createVehiclesRouter() {
	const router = Router();

	router.post('/', authMiddleware, requireMinRole('MANAGER'), upsertVehicle);

	return router;
}

export { createVehiclesRouter };
