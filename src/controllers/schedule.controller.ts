import { Request, Response } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { requireUser } from '../lib/http/requireUser';
import {
	scheduleMeQuerySchema,
	scheduleQuerySchema,
	scheduleAvailabilityCheckBodySchema,
	scheduleAvailabilityOptionsBodySchema,
} from '../schemas/schedule.schemas';
import {
	getMySchedule,
	getScheduleForTarget,
} from '../services/schedule.service';
import { checkScheduleAvailability } from '../services/schedule-validation/check';
import { getScheduleAvailabilityOptions } from '../services/schedule-validation/options';
import { parseRequestPart } from './requestParsing';

async function getMeHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const query = parseRequestPart(scheduleMeQuerySchema, req.query, 'query');

	const data = await getMySchedule(user, query);
	return sendJsonSuccess(res, data);
}

async function getScheduleHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const query = parseRequestPart(scheduleQuerySchema, req.query, 'query');

	const data = await getScheduleForTarget(user, query);
	return sendJsonSuccess(res, data);
}

async function postScheduleAvailabilityCheckHandler(
	req: Request,
	res: Response,
) {
	const user = requireUser(req);
	const body = parseRequestPart(
		scheduleAvailabilityCheckBodySchema,
		req.body,
		'body',
	);
	const data = await checkScheduleAvailability(user, body);

	return sendJsonSuccess(res, data);
}

async function postScheduleAvailabilityOptionsHandler(
	req: Request,
	res: Response,
) {
	const user = requireUser(req);
	const body = parseRequestPart(
		scheduleAvailabilityOptionsBodySchema,
		req.body,
		'body',
	);
	const data = await getScheduleAvailabilityOptions(user, body);

	return sendJsonSuccess(res, data);
}

export {
	getMeHandler,
	getScheduleHandler,
	postScheduleAvailabilityCheckHandler,
	postScheduleAvailabilityOptionsHandler,
};
