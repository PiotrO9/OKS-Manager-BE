import { Request, Response } from 'express';
import { sendJsonSuccess } from '../../lib/apiResponse';
import { requireUser } from '../../lib/http/requireUser';
import {
	createDrivingSchoolBodySchema,
	drivingSchoolIdParamsSchema,
	setDefaultVehicleBodySchema,
	updateDrivingSchoolBodySchema,
} from '../../schemas/driving-school.schemas';
import { schoolAvailabilitySlotsQuerySchema } from '../../schemas/school-availability.schemas';
import {
	createDrivingSchoolForOwner,
	deleteDrivingSchoolForOwner,
	getDefaultDrivingSchoolForOwner,
	listDrivingSchoolsForOwner,
	setDefaultDrivingSchoolForOwner,
	setDefaultVehicleForDrivingSchoolOwner,
	updateDrivingSchoolForOwner,
} from '../../services/driving-school/management';
import { listSchoolAvailabilitySlots } from '../../services/school-availability.service';
import { parseRequestPart } from '../requestParsing';

async function getDrivingSchools(req: Request, res: Response) {
	const user = requireUser(req);
	const data = await listDrivingSchoolsForOwner(user.id);
	return sendJsonSuccess(res, data);
}

async function createDrivingSchool(req: Request, res: Response) {
	const user = requireUser(req);
	const body = parseRequestPart(
		createDrivingSchoolBodySchema,
		req.body,
		'body',
	);

	const data = await createDrivingSchoolForOwner(user.id, body);
	return sendJsonSuccess(res, data, 201);
}

async function setDefaultDrivingSchool(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(
		drivingSchoolIdParamsSchema,
		req.params,
		'params',
	);

	const data = await setDefaultDrivingSchoolForOwner(
		user.id,
		params.id,
	);
	return sendJsonSuccess(res, data);
}

async function setDefaultVehicleForDrivingSchool(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(
		drivingSchoolIdParamsSchema,
		req.params,
		'params',
	);
	const body = parseRequestPart(
		setDefaultVehicleBodySchema,
		req.body,
		'body',
	);

	const data = await setDefaultVehicleForDrivingSchoolOwner(
		user.id,
		params.id,
		body.vehicleId,
	);
	return sendJsonSuccess(res, data);
}

async function updateDrivingSchool(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(
		drivingSchoolIdParamsSchema,
		req.params,
		'params',
	);
	const body = parseRequestPart(
		updateDrivingSchoolBodySchema,
		req.body,
		'body',
	);

	const data = await updateDrivingSchoolForOwner(
		user.id,
		params.id,
		body,
	);
	return sendJsonSuccess(res, data);
}

async function deleteDrivingSchool(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(
		drivingSchoolIdParamsSchema,
		req.params,
		'params',
	);

	const data = await deleteDrivingSchoolForOwner(user.id, params.id);
	return sendJsonSuccess(res, data);
}

async function getDefaultDrivingSchool(req: Request, res: Response) {
	const user = requireUser(req);
	const data = await getDefaultDrivingSchoolForOwner(user.id);
	return sendJsonSuccess(res, data);
}

async function getSchoolAvailabilitySlots(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(
		drivingSchoolIdParamsSchema,
		req.params,
		'params',
	);
	const query = parseRequestPart(
		schoolAvailabilitySlotsQuerySchema,
		req.query,
		'query',
	);

	const data = await listSchoolAvailabilitySlots(
		{ id: user.id, role: user.role },
		params.id,
		query,
	);
	return sendJsonSuccess(res, data);
}

export {
	getDrivingSchools,
	getDefaultDrivingSchool,
	createDrivingSchool,
	setDefaultDrivingSchool,
	setDefaultVehicleForDrivingSchool,
	updateDrivingSchool,
	deleteDrivingSchool,
	getSchoolAvailabilitySlots,
};
