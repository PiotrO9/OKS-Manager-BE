import { Request, Response } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { requireUser } from '../lib/http/requireUser';
import { instructorIdParamsSchema } from '../lib/validation/uuid';
import {
	instructorLessonRatingsQuerySchema,
	listLessonRatingsQuerySchema,
} from '../schemas/lesson-rating.schemas';
import {
	listInstructorLessonRatingsForManager,
	listLessonRatingsForManager,
	listOwnLessonRatingsForInstructor,
} from '../services/lesson-rating.service';
import { parseRequestPart } from './requestParsing';

async function listLessonRatingsHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const query = parseRequestPart(
		listLessonRatingsQuerySchema,
		req.query,
		'query',
	);

	const data = await listLessonRatingsForManager(user, query);
	return sendJsonSuccess(res, data, 200);
}

async function listInstructorLessonRatingsHandler(
	req: Request,
	res: Response,
) {
	const user = requireUser(req);
	const params = parseRequestPart(
		instructorIdParamsSchema,
		req.params,
		'params',
	);
	const query = parseRequestPart(
		instructorLessonRatingsQuerySchema,
		req.query,
		'query',
	);

	const data = await listInstructorLessonRatingsForManager(
		user,
		params.id,
		query,
	);
	return sendJsonSuccess(res, data, 200);
}

async function listOwnLessonRatingsHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const data = await listOwnLessonRatingsForInstructor(user);
	return sendJsonSuccess(res, data, 200);
}

export {
	listInstructorLessonRatingsHandler,
	listLessonRatingsHandler,
	listOwnLessonRatingsHandler,
};
