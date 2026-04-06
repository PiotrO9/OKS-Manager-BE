import { Router } from 'express';
import multer from 'multer';
import { authMiddleware, requireMinRole } from '../auth/auth.middleware';
import { sendJsonError } from '../lib/apiResponse';
import {
	deleteVehicle,
	getVehicleById,
	listVehiclesBySchool,
	updateVehicle,
	uploadVehiclePhoto,
	upsertVehicle,
} from './vehicles.controller';

const vehiclePhotoUpload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 5 * 1024 * 1024 },
});

function createVehiclesRouter() {
	const router = Router();

	router.get(
		'/',
		authMiddleware,
		requireMinRole('MANAGER'),
		listVehiclesBySchool,
	);
	router.get(
		'/:id',
		authMiddleware,
		requireMinRole('MANAGER'),
		getVehicleById,
	);
	router.post('/', authMiddleware, requireMinRole('MANAGER'), upsertVehicle);
	router.post(
		'/:id/photo',
		authMiddleware,
		requireMinRole('MANAGER'),
		(req, res, next) => {
			vehiclePhotoUpload.single('file')(req, res, (err: unknown) => {
				if (err instanceof multer.MulterError) {
					if (err.code === 'LIMIT_FILE_SIZE') {
						return sendJsonError(
							res,
							'file too large (max 5 MB)',
							400,
						);
					}
				}
				next(err);
			});
		},
		uploadVehiclePhoto,
	);
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
