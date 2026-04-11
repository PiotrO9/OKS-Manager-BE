import { Request, Response } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { AppError } from '../lib/http/AppError';
import { requireUser } from '../lib/http/requireUser';
import {
	scheduleMeQuerySchema,
	scheduleQuerySchema,
} from '../schemas/schedule.schemas';
import {
	getMySchedule,
	getScheduleForTarget,
} from '../services/schedule.service';

async function getMeHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const parsed = scheduleMeQuerySchema.safeParse(req.query);
	if (!parsed.success) {
		const message = parsed.error.issues[0]?.message ?? 'Invalid query';
		throw AppError.badRequest(message);
	}

	const data = await getMySchedule(user, parsed.data);
	return sendJsonSuccess(res, data);
}

async function getScheduleHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const parsed = scheduleQuerySchema.safeParse(req.query);
	if (!parsed.success) {
		const message = parsed.error.issues[0]?.message ?? 'Invalid query';
		throw AppError.badRequest(message);
	}

	const data = await getScheduleForTarget(user, parsed.data);
	return sendJsonSuccess(res, data);
}

export { getMeHandler, getScheduleHandler };
