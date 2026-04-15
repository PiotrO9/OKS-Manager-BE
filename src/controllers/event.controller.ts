import { Request, Response } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { AppError } from '../lib/http/AppError';
import { requireUser } from '../lib/http/requireUser';
import {
	eventIdAndStudentUserParamsSchema,
	eventIdParamsSchema,
} from '../lib/validation/uuid';
import {
	eligibleStudentsQuerySchema,
	getEventQuerySchema,
	parseAssignStudentsBody,
	parseCreateInstructorEventBody,
	parsePatchInstructorEventBody,
	parseReplaceEventStudentsBody,
} from '../schemas/event.schemas';
import {
	assignStudentsToEvent,
	createInstructorEvent,
	deleteInstructorEvent,
	getEventStudentUserIds,
	getInstructorEventById,
	listTheoryEventEligibleStudents,
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

	const queryParsed = getEventQuerySchema.safeParse(req.query);
	if (!queryParsed.success) {
		throw AppError.badRequest(
			queryParsed.error.issues[0]?.message ?? 'Invalid query',
		);
	}

	const includeSlots = queryParsed.data.includeSlots === 'true';

	const data = await getInstructorEventById(user, paramsParsed.data.id, {
		includeSlots,
	});
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

async function getEventEligibleStudentsHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const paramsParsed = eventIdParamsSchema.safeParse(req.params);
	if (!paramsParsed.success) {
		throw AppError.badRequest(
			paramsParsed.error.issues[0]?.message ?? 'Invalid params',
		);
	}

	const queryParsed = eligibleStudentsQuerySchema.safeParse(req.query);
	if (!queryParsed.success) {
		throw AppError.badRequest(
			queryParsed.error.issues[0]?.message ?? 'Invalid query',
		);
	}

	const q = queryParsed.data;
	let opts: { overrideStart?: Date; overrideEnd?: Date } | undefined;
	if (q.startTime !== undefined && q.endTime !== undefined) {
		opts = {
			overrideStart: new Date(q.startTime),
			overrideEnd: new Date(q.endTime),
		};
	}

	const data = await listTheoryEventEligibleStudents(
		user,
		paramsParsed.data.id,
		opts,
	);
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

async function deleteEventHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const paramsParsed = eventIdParamsSchema.safeParse(req.params);
	if (!paramsParsed.success) {
		throw AppError.badRequest(
			paramsParsed.error.issues[0]?.message ?? 'Invalid params',
		);
	}
	await deleteInstructorEvent(user, paramsParsed.data.id);
	return sendJsonSuccess(res, undefined, 204);
}

export {
	deleteEventHandler,
	deleteEventStudentsHandler,
	getEventEligibleStudentsHandler,
	getEventHandler,
	getEventStudentsHandler,
	patchEventHandler,
	postEventHandler,
	postEventStudentsHandler,
	putEventStudentsHandler,
};
