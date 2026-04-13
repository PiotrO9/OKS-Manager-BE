import { Request, Response } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { AppError } from '../lib/http/AppError';
import { requireUser } from '../lib/http/requireUser';
import {
	eventIdAndStudentUserParamsSchema,
	eventIdParamsSchema,
} from '../lib/validation/uuid';
import {
	parseAssignStudentsBody,
	parseCreateInstructorEventBody,
	parsePatchInstructorEventBody,
	parseReplaceEventStudentsBody,
} from '../schemas/event.schemas';
import {
	assignStudentsToEvent,
	createInstructorEvent,
	getEventStudentUserIds,
	getInstructorEventById,
	removeStudentFromEvent,
	replaceEventStudents,
	updateInstructorEvent,
} from '../services/event.service';

async function postEventHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const parsed = parseCreateInstructorEventBody(req.body);
	if (!parsed.ok) {
		throw AppError.badRequest(parsed.error);
	}

	const data = await createInstructorEvent(user, parsed.data);
	return sendJsonSuccess(res, data, 201);
}

async function putEventStudentsHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const paramsParsed = eventIdParamsSchema.safeParse(req.params);
	if (!paramsParsed.success) {
		throw AppError.badRequest(
			paramsParsed.error.issues[0]?.message ?? 'Invalid params',
		);
	}
	const parsed = parseReplaceEventStudentsBody(req.body);
	if (!parsed.ok) {
		throw AppError.badRequest(parsed.error);
	}

	const data = await replaceEventStudents(
		user,
		paramsParsed.data.id,
		parsed.data,
	);
	return sendJsonSuccess(res, data, 200);
}

async function deleteEventStudentsHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const paramsParsed = eventIdAndStudentUserParamsSchema.safeParse(
		req.params,
	);
	if (!paramsParsed.success) {
		throw AppError.badRequest(
			paramsParsed.error.issues[0]?.message ?? 'Invalid params',
		);
	}

	const data = await removeStudentFromEvent(
		user,
		paramsParsed.data.id,
		paramsParsed.data.studentUserId,
	);
	return sendJsonSuccess(res, data, 200);
}

async function postEventStudentsHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const paramsParsed = eventIdParamsSchema.safeParse(req.params);
	if (!paramsParsed.success) {
		throw AppError.badRequest(
			paramsParsed.error.issues[0]?.message ?? 'Invalid params',
		);
	}
	const parsed = parseAssignStudentsBody(req.body);
	if (!parsed.ok) {
		throw AppError.badRequest(parsed.error);
	}

	const data = await assignStudentsToEvent(
		user,
		paramsParsed.data.id,
		parsed.data,
	);
	return sendJsonSuccess(res, data, 200);
}

async function getEventHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const paramsParsed = eventIdParamsSchema.safeParse(req.params);
	if (!paramsParsed.success) {
		throw AppError.badRequest(
			paramsParsed.error.issues[0]?.message ?? 'Invalid params',
		);
	}

	const data = await getInstructorEventById(user, paramsParsed.data.id);
	return sendJsonSuccess(res, data, 200);
}

async function getEventStudentsHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const paramsParsed = eventIdParamsSchema.safeParse(req.params);
	if (!paramsParsed.success) {
		throw AppError.badRequest(
			paramsParsed.error.issues[0]?.message ?? 'Invalid params',
		);
	}

	const data = await getEventStudentUserIds(user, paramsParsed.data.id);
	return sendJsonSuccess(res, data, 200);
}

async function patchEventHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const paramsParsed = eventIdParamsSchema.safeParse(req.params);
	if (!paramsParsed.success) {
		throw AppError.badRequest(
			paramsParsed.error.issues[0]?.message ?? 'Invalid params',
		);
	}
	const parsed = parsePatchInstructorEventBody(req.body);
	if (!parsed.ok) {
		throw AppError.badRequest(parsed.error);
	}

	const data = await updateInstructorEvent(
		user,
		paramsParsed.data.id,
		parsed.data,
	);
	return sendJsonSuccess(res, data, 200);
}

export {
	deleteEventStudentsHandler,
	getEventHandler,
	getEventStudentsHandler,
	patchEventHandler,
	postEventHandler,
	postEventStudentsHandler,
	putEventStudentsHandler,
};
