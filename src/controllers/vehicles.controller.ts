import { Request, Response } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
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
import { parseRequestPart } from './requestParsing';

async function listVehiclesBySchool(req: Request, res: Response) {
	const user = requireUser(req);
	const query = parseRequestPart(vehicleListQuerySchema, req.query, 'query');

	const timeRange =
		query.startTime && query.endTime
			? {
				start: new Date(query.startTime),
				end: new Date(query.endTime),
			}
			: undefined;

	const data = await vehicleService.listVehiclesBySchoolForUser(
		user.id,
		query.schoolId,
		timeRange,
	);
	return sendJsonSuccess(res, data);
}

async function getVehicleById(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(vehicleIdParamsSchema, req.params, 'params');

	const data = await vehicleService.getVehicleByIdForUser(
		user.id,
		params.id,
	);
	return sendJsonSuccess(res, data);
}

async function uploadVehiclePhoto(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(vehicleIdParamsSchema, req.params, 'params');

	const file = (req as Request & { file?: UploadedPhotoFile }).file;
	const data = await vehicleService.uploadVehiclePhotoForUser(
		user.id,
		params.id,
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
	const params = parseRequestPart(vehicleIdParamsSchema, req.params, 'params');

	const body = req.body as Record<string, unknown>;
	const updated = await vehicleService.updateVehicleForUser(
		user.id,
		params.id,
		body,
	);
	return sendJsonSuccess(res, updated);
}

async function updateVehicleStatus(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(vehicleIdParamsSchema, req.params, 'params');
	const body = parseRequestPart(
		vehicleAvailabilityStatusSchema,
		req.body,
		'body',
	);

	const updated = await vehicleService.updateVehicleStatusForUser(
		user.id,
		params.id,
		body.status,
	);
	return sendJsonSuccess(res, updated);
}

async function deleteVehicle(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(vehicleIdParamsSchema, req.params, 'params');

	const data = await vehicleService.deleteVehicleForUser(
		user.id,
		params.id,
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
