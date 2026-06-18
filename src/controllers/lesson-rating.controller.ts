import { Request, Response } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { AppError } from '../lib/http/AppError';
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

async function listLessonRatingsHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const parsed = listLessonRatingsQuerySchema.safeParse(req.query);
	if (!parsed.success) {
		throw AppError.badRequest(
			parsed.error.issues[0]?.message ?? 'Invalid query',
		);
	}

	const data = await listLessonRatingsForManager(user, parsed.data);
	return sendJsonSuccess(res, data, 200);
}

async function listInstructorLessonRatingsHandler(
	req: Request,
	res: Response,
) {
	const user = requireUser(req);
	const paramsParsed = instructorIdParamsSchema.safeParse(req.params);
	if (!paramsParsed.success) {
		throw AppError.badRequest(
			paramsParsed.error.issues[0]?.message ?? 'Invalid params',
		);
	}
	const queryParsed = instructorLessonRatingsQuerySchema.safeParse(req.query);
	if (!queryParsed.success) {
		throw AppError.badRequest(
			queryParsed.error.issues[0]?.message ?? 'Invalid query',
		);
	}

	const data = await listInstructorLessonRatingsForManager(
		user,
		paramsParsed.data.id,
		queryParsed.data,
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
