import { Request, Response } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { AppError } from '../lib/http/AppError';
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

async function postOwnLessonHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const parsed = parseBookOwnLessonBody(req.body);
	if (!parsed.ok) {
		throw AppError.badRequest(parsed.error);
	}

	const data = await bookOwnLesson(user, parsed.data);
	return sendJsonSuccess(res, data, 201);
}

async function cancelOwnLessonHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const paramsParsed = lessonRatingParamsSchema.safeParse(req.params);
	if (!paramsParsed.success) {
		throw AppError.badRequest(
			paramsParsed.error.issues[0]?.message ?? 'Invalid params',
		);
	}

	const data = await cancelOwnLesson(user, paramsParsed.data.lessonId);
	return sendJsonSuccess(res, data, 200);
}

async function postLessonRatingHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const paramsParsed = lessonRatingParamsSchema.safeParse(req.params);
	if (!paramsParsed.success) {
		throw AppError.badRequest(
			paramsParsed.error.issues[0]?.message ?? 'Invalid params',
		);
	}
	const parsed = parseCreateLessonRatingBody(req.body);
	if (!parsed.ok) {
		throw AppError.badRequest(parsed.error);
	}

	const data = await createLessonRating(
		user,
		paramsParsed.data.lessonId,
		parsed.data,
	);
	return sendJsonSuccess(res, data, 201);
}

async function getLessonRatingHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const paramsParsed = lessonRatingParamsSchema.safeParse(req.params);
	if (!paramsParsed.success) {
		throw AppError.badRequest(
			paramsParsed.error.issues[0]?.message ?? 'Invalid params',
		);
	}

	const data = await getLessonRatingForStudent(
		user,
		paramsParsed.data.lessonId,
	);
	return sendJsonSuccess(res, data, 200);
}

async function patchLessonHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const paramsParsed = lessonIdParamsSchema.safeParse(req.params);
	if (!paramsParsed.success) {
		throw AppError.badRequest(
			paramsParsed.error.issues[0]?.message ?? 'Invalid params',
		);
	}
	const parsed = parsePatchLessonBody(req.body);
	if (!parsed.ok) {
		throw AppError.badRequest(parsed.error);
	}

	const patchBody = parsed.data;
	if ('status' in patchBody && patchBody.status === 'CANCELLED') {
		const data = await cancelLesson(user, paramsParsed.data.id);
		return sendJsonSuccess(res, data, 200);
	}

	const data = await updateLesson(
		user,
		paramsParsed.data.id,
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
