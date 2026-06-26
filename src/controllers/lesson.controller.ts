import { Request, Response } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { requireUser } from '../lib/http/requireUser';
import { lessonIdParamsSchema } from '../lib/validation/uuid';
import {
	lessonRatingParamsSchema,
	parseBookLessonBody,
	parseBookOwnLessonBody,
	parseCreateLessonRatingBody,
	parsePatchLessonBody,
	type UpdateLessonBody,
} from '../schemas/lesson.schemas';
import {
	createLessonRating,
	getLessonRatingForStudent,
} from '../services/lesson-rating.service';
import {
	bookLesson,
	bookOwnLesson,
	cancelLesson,
	cancelOwnLesson,
	getLessonById,
	updateLesson,
} from '../services/lesson.service';
import { parseBodyWithParser, parseRequestPart } from './requestParsing';

async function getLessonHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(lessonIdParamsSchema, req.params, 'params');

	const data = await getLessonById(user, params.id);
	return sendJsonSuccess(res, data, 200);
}

async function postLessonHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const body = parseBodyWithParser(parseBookLessonBody, req.body);

	const data = await bookLesson(user, body);
	return sendJsonSuccess(res, data, 201);
}

async function postOwnLessonHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const body = parseBodyWithParser(parseBookOwnLessonBody, req.body);

	const data = await bookOwnLesson(user, body);
	return sendJsonSuccess(res, data, 201);
}

async function cancelOwnLessonHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(
		lessonRatingParamsSchema,
		req.params,
		'params',
	);

	const data = await cancelOwnLesson(user, params.lessonId);
	return sendJsonSuccess(res, data, 200);
}

async function postLessonRatingHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(
		lessonRatingParamsSchema,
		req.params,
		'params',
	);
	const body = parseBodyWithParser(parseCreateLessonRatingBody, req.body);

	const data = await createLessonRating(
		user,
		params.lessonId,
		body,
	);
	return sendJsonSuccess(res, data, 201);
}

async function getLessonRatingHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(
		lessonRatingParamsSchema,
		req.params,
		'params',
	);

	const data = await getLessonRatingForStudent(
		user,
		params.lessonId,
	);
	return sendJsonSuccess(res, data, 200);
}

async function patchLessonHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(lessonIdParamsSchema, req.params, 'params');
	const patchBody = parseBodyWithParser(parsePatchLessonBody, req.body);

	if ('status' in patchBody && patchBody.status === 'CANCELLED') {
		const data = await cancelLesson(user, params.id);
		return sendJsonSuccess(res, data, 200);
	}

	const data = await updateLesson(
		user,
		params.id,
		patchBody as UpdateLessonBody,
	);
	return sendJsonSuccess(res, data, 200);
}

export {
	cancelOwnLessonHandler,
	getLessonHandler,
	getLessonRatingHandler,
	patchLessonHandler,
	postLessonHandler,
	postOwnLessonHandler,
	postLessonRatingHandler,
};
