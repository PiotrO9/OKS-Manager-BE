import { Request, Response } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { AppError } from '../lib/http/AppError';
import { requireUser } from '../lib/http/requireUser';
import {
	vehicleAvailabilityStatusSchema,
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

	const timeRange =
		parsed.data.startTime && parsed.data.endTime
			? {
				start: new Date(parsed.data.startTime),
				end: new Date(parsed.data.endTime),
			}
			: undefined;

	const data = await vehicleService.listVehiclesBySchoolForUser(
		user.id,
		parsed.data.schoolId,
		timeRange,
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

async function updateVehicleStatus(req: Request, res: Response) {
	const user = requireUser(req);
	const params = vehicleIdParamsSchema.safeParse(req.params);
	if (!params.success) {
		throw AppError.badRequest('Invalid vehicle id');
	}

	const parsed = vehicleAvailabilityStatusSchema.safeParse(req.body);
	if (!parsed.success) {
		throw AppError.badRequest('status must be ACTIVE or UNAVAILABLE');
	}

	const updated = await vehicleService.updateVehicleStatusForUser(
		user.id,
		params.data.id,
		parsed.data.status,
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
	updateVehicleStatus,
	deleteVehicle,
};
