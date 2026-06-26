import { Request, Response } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { requireUser } from '../lib/http/requireUser';
import {
	eventIdAndStudentUserParamsSchema,
	eventIdParamsSchema,
} from '../lib/validation/uuid';
import {
	eligibleStudentsQuerySchema,
	getEventQuerySchema,
	listEventsQuerySchema,
	parseAssignStudentsBody,
	parseBulkUpdateEventStatusBody,
	parseCreateInstructorEventBody,
	parsePatchInstructorEventBody,
	parseReplaceEventStudentsBody,
} from '../schemas/event.schemas';
import {
	assignStudentsToEvent,
	bulkUpdateEventStatus,
	createInstructorEvent,
	deleteInstructorEvent,
	getEventStudentUserIds,
	getInstructorEventById,
	listInstructorEvents,
	listTheoryEventEligibleStudents,
	removeStudentFromEvent,
	replaceEventStudents,
	updateInstructorEvent,
} from '../services/event.service';
import { parseBodyWithParser, parseRequestPart } from './requestParsing';

async function getEventsHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const query = parseRequestPart(listEventsQuerySchema, req.query, 'query');
	const data = await listInstructorEvents(user, query);
	return sendJsonSuccess(res, data, 200);
}

async function patchEventsBulkStatusHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const body = parseBodyWithParser(parseBulkUpdateEventStatusBody, req.body);
	const data = await bulkUpdateEventStatus(user, body);
	return sendJsonSuccess(res, data, 200);
}

async function postEventHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const body = parseBodyWithParser(parseCreateInstructorEventBody, req.body);

	const data = await createInstructorEvent(user, body);
	return sendJsonSuccess(res, data, 201);
}

async function putEventStudentsHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(eventIdParamsSchema, req.params, 'params');
	const body = parseBodyWithParser(parseReplaceEventStudentsBody, req.body);

	const data = await replaceEventStudents(user, params.id, body);
	return sendJsonSuccess(res, data, 200);
}

async function deleteEventStudentsHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(
		eventIdAndStudentUserParamsSchema,
		req.params,
		'params',
	);

	const data = await removeStudentFromEvent(
		user,
		params.id,
		params.studentUserId,
	);
	return sendJsonSuccess(res, data, 200);
}

async function postEventStudentsHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(eventIdParamsSchema, req.params, 'params');
	const body = parseBodyWithParser(parseAssignStudentsBody, req.body);

	const data = await assignStudentsToEvent(user, params.id, body);
	return sendJsonSuccess(res, data, 200);
}

async function getEventHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(eventIdParamsSchema, req.params, 'params');
	const query = parseRequestPart(getEventQuerySchema, req.query, 'query');

	const includeSlots = query.includeSlots === 'true';

	const data = await getInstructorEventById(user, params.id, {
		includeSlots,
	});
	return sendJsonSuccess(res, data, 200);
}

async function getEventStudentsHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(eventIdParamsSchema, req.params, 'params');

	const data = await getEventStudentUserIds(user, params.id);
	return sendJsonSuccess(res, data, 200);
}

async function getEventEligibleStudentsHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(eventIdParamsSchema, req.params, 'params');
	const query = parseRequestPart(
		eligibleStudentsQuerySchema,
		req.query,
		'query',
	);

	let opts: { overrideStart?: Date; overrideEnd?: Date } | undefined;
	if (query.startTime !== undefined && query.endTime !== undefined) {
		opts = {
			overrideStart: new Date(query.startTime),
			overrideEnd: new Date(query.endTime),
		};
	}

	const data = await listTheoryEventEligibleStudents(
		user,
		params.id,
		opts,
	);
	return sendJsonSuccess(res, data, 200);
}

async function patchEventHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(eventIdParamsSchema, req.params, 'params');
	const body = parseBodyWithParser(parsePatchInstructorEventBody, req.body);

	const data = await updateInstructorEvent(user, params.id, body);
	return sendJsonSuccess(res, data, 200);
}

async function deleteEventHandler(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(eventIdParamsSchema, req.params, 'params');
	await deleteInstructorEvent(user, params.id);
	return sendJsonSuccess(res, undefined, 204);
}

export {
	deleteEventHandler,
	deleteEventStudentsHandler,
	getEventEligibleStudentsHandler,
	getEventHandler,
	getEventStudentsHandler,
	getEventsHandler,
	patchEventHandler,
	patchEventsBulkStatusHandler,
	postEventHandler,
	postEventStudentsHandler,
	putEventStudentsHandler,
};
