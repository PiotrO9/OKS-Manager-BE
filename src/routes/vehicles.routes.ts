import { Router } from 'express';
import multer from 'multer';
import {
	deleteVehicle,
	getVehicleById,
	listVehiclesBySchool,
	updateVehicle,
	uploadVehiclePhoto,
	upsertVehicle,
} from '../controllers/vehicles.controller';
import { authMiddleware, requireMinRole } from '../middleware/auth.middleware';
import { sendJsonError } from '../lib/apiResponse';
import { asyncHandler } from '../lib/http/asyncHandler';

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
		asyncHandler(listVehiclesBySchool),
	);
	router.get(
		'/:id',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(getVehicleById),
	);
	router.post(
		'/',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(upsertVehicle),
	);
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
		asyncHandler(uploadVehiclePhoto),
	);
	router.patch(
		'/:id',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(updateVehicle),
	);
	router.delete(
		'/:id',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(deleteVehicle),
	);

	return router;
}

export { createVehiclesRouter };
