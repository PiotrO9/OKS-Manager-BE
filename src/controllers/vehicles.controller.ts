import { Request, Response } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { AppError } from '../lib/http/AppError';
import { requireUser } from '../lib/http/requireUser';
import {
	vehicleIdParamsSchema,
	vehicleListQuerySchema,
} from '../schemas/vehicle.schemas';
import {
	type UploadedPhotoFile,
	vehicleService,
} from '../services/vehicle.service';

async function listVehiclesBySchool(req: Request, res: Response) {
	const user = requireUser(req);
	const parsed = vehicleListQuerySchema.safeParse(req.query);
	if (!parsed.success) {
		const message = parsed.error.issues[0]?.message ?? 'Invalid query';
		throw AppError.badRequest(message);
	}

	const data = await vehicleService.listVehiclesBySchoolForUser(
		user.id,
		parsed.data.schoolId,
	);
	return sendJsonSuccess(res, data);
}

async function getVehicleById(req: Request, res: Response) {
	const user = requireUser(req);
	const params = vehicleIdParamsSchema.safeParse(req.params);
	if (!params.success) {
		throw AppError.badRequest('Invalid vehicle id');
	}

	const data = await vehicleService.getVehicleByIdForUser(
		user.id,
		params.data.id,
	);
	return sendJsonSuccess(res, data);
}

async function uploadVehiclePhoto(req: Request, res: Response) {
	const user = requireUser(req);
	const params = vehicleIdParamsSchema.safeParse(req.params);
	if (!params.success) {
		throw AppError.badRequest('Invalid vehicle id');
	}

	const file = (req as Request & { file?: UploadedPhotoFile }).file;
	const data = await vehicleService.uploadVehiclePhotoForUser(
		user.id,
		params.data.id,
		file as UploadedPhotoFile,
	);
	return sendJsonSuccess(res, data);
}

async function upsertVehicle(req: Request, res: Response) {
	const user = requireUser(req);
	const body = req.body as Record<string, unknown>;
	const result = await vehicleService.upsertVehicleForUser(user.id, body);
	return sendJsonSuccess(res, result.vehicle, result.status);
}

async function updateVehicle(req: Request, res: Response) {
	const user = requireUser(req);
	const params = vehicleIdParamsSchema.safeParse(req.params);
	if (!params.success) {
		throw AppError.badRequest('Invalid vehicle id');
	}

	const body = req.body as Record<string, unknown>;
	const updated = await vehicleService.updateVehicleForUser(
		user.id,
		params.data.id,
		body,
	);
	return sendJsonSuccess(res, updated);
}

async function deleteVehicle(req: Request, res: Response) {
	const user = requireUser(req);
	const params = vehicleIdParamsSchema.safeParse(req.params);
	if (!params.success) {
		throw AppError.badRequest('Invalid vehicle id');
	}

	const data = await vehicleService.deleteVehicleForUser(
		user.id,
		params.data.id,
	);
	return sendJsonSuccess(res, data);
}

export {
	upsertVehicle,
	listVehiclesBySchool,
	getVehicleById,
	uploadVehiclePhoto,
	updateVehicle,
	deleteVehicle,
};
