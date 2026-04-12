import { Request, Response } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { AppError } from '../lib/http/AppError';
import { requireUser } from '../lib/http/requireUser';
import { lessonIdParamsSchema } from '../lib/validation/uuid';
import {
	parseBookLessonBody,
	parseCancelLessonBody,
} from '../schemas/lesson.schemas';
import {
	bookLesson,
	cancelLesson,
	getLessonById,
} from '../services/lesson.service';

async function getLessonHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const paramsParsed = lessonIdParamsSchema.safeParse(req.params);
	if (!paramsParsed.success) {
		throw AppError.badRequest(
			paramsParsed.error.issues[0]?.message ?? 'Invalid params',
		);
	}

	const data = await getLessonById(user, paramsParsed.data.id);
	return sendJsonSuccess(res, data, 200);
}

async function postLessonHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const parsed = parseBookLessonBody(req.body);
	if (!parsed.ok) {
		throw AppError.badRequest(parsed.error);
	}

	const data = await bookLesson(user, parsed.data);
	return sendJsonSuccess(res, data, 201);
}

async function patchLessonHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const paramsParsed = lessonIdParamsSchema.safeParse(req.params);
	if (!paramsParsed.success) {
		throw AppError.badRequest(
			paramsParsed.error.issues[0]?.message ?? 'Invalid params',
		);
	}
	const parsed = parseCancelLessonBody(req.body);
	if (!parsed.ok) {
		throw AppError.badRequest(parsed.error);
	}

	const data = await cancelLesson(user, paramsParsed.data.id);
	return sendJsonSuccess(res, data, 200);
}

export { getLessonHandler, patchLessonHandler, postLessonHandler };
