import { Request, Response } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { requireUser } from '../lib/http/requireUser';
import {
	scheduleMeQuerySchema,
	scheduleQuerySchema,
} from '../schemas/schedule.schemas';
import {
	getMySchedule,
	getScheduleForTarget,
} from '../services/schedule.service';
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

export { getMeHandler, getScheduleHandler };
