import { Router } from 'express';
import { authMiddleware } from '../auth/auth.middleware';
import { getDrivingSchools } from './driving-schools.controller';

function createDrivingSchoolsRouter() {
	const router = Router();

	router.get('/', authMiddleware, getDrivingSchools);

	return router;
}

export { createDrivingSchoolsRouter };
