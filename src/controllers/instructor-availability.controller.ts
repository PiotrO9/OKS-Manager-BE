import { Request, Response } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { requireUser } from '../lib/http/requireUser';
import {
	computeQuerySchema,
	dayOfWeekParamsSchema,
	exceptionDateParamsSchema,
	exceptionsQuerySchema,
	instructorIdParamsSchema,
	parsePutExceptionBody,
	parsePutWeeklyBody,
	slotsQuerySchema,
} from '../schemas/instructor-availability.schemas';
import {
	computeAvailability,
	deleteException,
	deleteWeeklyDay,
	generateSlots,
	getWeeklyAvailability,
	listExceptions,
	upsertException,
	upsertWeeklyDay,
} from '../services/instructor-availability.service';
import { parseBodyWithParser, parseRequestPart } from './requestParsing';

// ── Weekly ────────────────────────────────────────────────────────────────────

async function getWeekly(req: Request, res: Response) {
	const actor = requireUser(req);

	const params = parseRequestPart(
		instructorIdParamsSchema,
		req.params,
		'params',
	);

	const data = await getWeeklyAvailability(actor, params.instructorId);
	return sendJsonSuccess(res, { weekly: data });
}

async function putWeeklyDay(req: Request, res: Response) {
	const actor = requireUser(req);

	const params = parseRequestPart(
		dayOfWeekParamsSchema,
		req.params,
		'params',
	);

	const body = parseBodyWithParser(parsePutWeeklyBody, req.body);

	const data = await upsertWeeklyDay(
		actor,
		params.instructorId,
		params.dayOfWeek,
		body,
	);
	return sendJsonSuccess(res, { entry: data });
}

async function deleteWeeklyDayHandler(req: Request, res: Response) {
	const actor = requireUser(req);

	const params = parseRequestPart(
		dayOfWeekParamsSchema,
		req.params,
		'params',
	);

	await deleteWeeklyDay(
		actor,
		params.instructorId,
		params.dayOfWeek,
	);
	res.status(204).send();
}

// ── Exceptions ────────────────────────────────────────────────────────────────

async function getExceptions(req: Request, res: Response) {
	const actor = requireUser(req);

	const params = parseRequestPart(
		instructorIdParamsSchema,
		req.params,
		'params',
	);
	const query = parseRequestPart(exceptionsQuerySchema, req.query, 'query');

	const data = await listExceptions(
		actor,
		params.instructorId,
		query.from,
		query.to,
	);
	return sendJsonSuccess(res, { exceptions: data });
}

async function putExceptionHandler(req: Request, res: Response) {
	const actor = requireUser(req);

	const params = parseRequestPart(
		exceptionDateParamsSchema,
		req.params,
		'params',
	);

	const body = parseBodyWithParser(parsePutExceptionBody, req.body);

	const data = await upsertException(
		actor,
		params.instructorId,
		params.date,
		body,
	);
	return sendJsonSuccess(res, { exception: data });
}

async function deleteExceptionHandler(req: Request, res: Response) {
	const actor = requireUser(req);

	const params = parseRequestPart(
		exceptionDateParamsSchema,
		req.params,
		'params',
	);

	await deleteException(actor, params.instructorId, params.date);
	res.status(204).send();
}

// ── Compute ───────────────────────────────────────────────────────────────────

async function computeAvailabilityHandler(req: Request, res: Response) {
	const actor = requireUser(req);

	const params = parseRequestPart(
		instructorIdParamsSchema,
		req.params,
		'params',
	);
	const query = parseRequestPart(computeQuerySchema, req.query, 'query');

	const data = await computeAvailability(
		actor,
		params.instructorId,
		query.date,
	);
	return sendJsonSuccess(res, data);
}

// ── Slots ─────────────────────────────────────────────────────────────────────

async function getSlotsHandler(req: Request, res: Response) {
	const actor = requireUser(req);

	const params = parseRequestPart(
		instructorIdParamsSchema,
		req.params,
		'params',
	);
	const query = parseRequestPart(slotsQuerySchema, req.query, 'query');

	const data = await generateSlots(
		actor,
		params.instructorId,
		query.dateFrom,
		query.dateTo,
	);
	return sendJsonSuccess(res, { slots: data });
}

export {
	computeAvailabilityHandler,
	deleteExceptionHandler,
	deleteWeeklyDayHandler,
	getExceptions,
	getSlotsHandler,
	getWeekly,
	putExceptionHandler,
	putWeeklyDay,
};
