import { Request, Response } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { AppError } from '../lib/http/AppError';
import { requireUser } from '../lib/http/requireUser';
import { parseBookLessonBody } from '../schemas/lesson.schemas';
import { bookLesson } from '../services/lesson.service';

async function postLessonHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const parsed = parseBookLessonBody(req.body);
	if (!parsed.ok) {
		throw AppError.badRequest(parsed.error);
	}

	const data = await bookLesson(user, parsed.data);
	return sendJsonSuccess(res, data, 201);
}

export { postLessonHandler };
