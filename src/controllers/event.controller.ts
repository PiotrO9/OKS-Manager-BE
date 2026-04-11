import { Request, Response } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { AppError } from '../lib/http/AppError';
import { requireUser } from '../lib/http/requireUser';
import { parseCreateInstructorEventBody } from '../schemas/event.schemas';
import { createInstructorEvent } from '../services/event.service';

async function postEventHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const parsed = parseCreateInstructorEventBody(req.body);
	if (!parsed.ok) {
		throw AppError.badRequest(parsed.error);
	}

	const data = await createInstructorEvent(user, parsed.data);
	return sendJsonSuccess(res, data, 201);
}

export { postEventHandler };
