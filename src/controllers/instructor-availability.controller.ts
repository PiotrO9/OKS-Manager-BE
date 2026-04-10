import { Request, Response } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { AppError } from '../lib/http/AppError';
import { requireUser } from '../lib/http/requireUser';
import {
	computeQuerySchema,
	dayOfWeekParamsSchema,
	exceptionDateParamsSchema,
	exceptionsQuerySchema,
	instructorIdParamsSchema,
	parsePutExceptionBody,
	parsePutWeeklyBody,
} from '../schemas/instructor-availability.schemas';
import {
	computeAvailability,
	deleteException,
	deleteWeeklyDay,
	getWeeklyAvailability,
	listExceptions,
	upsertException,
	upsertWeeklyDay,
} from '../services/instructor-availability.service';

// ── Weekly ────────────────────────────────────────────────────────────────────

async function getWeekly(req: Request, res: Response) {
	const actor = requireUser(req);

	const params = instructorIdParamsSchema.safeParse(req.params);
	if (!params.success) {
		throw AppError.badRequest(
			params.error.issues[0]?.message ?? 'Invalid params',
		);
	}

	const data = await getWeeklyAvailability(actor, params.data.instructorId);
	return sendJsonSuccess(res, { weekly: data });
}

async function putWeeklyDay(req: Request, res: Response) {
	const actor = requireUser(req);

	const params = dayOfWeekParamsSchema.safeParse(req.params);
	if (!params.success) {
		throw AppError.badRequest(
			params.error.issues[0]?.message ?? 'Invalid params',
		);
	}

	const body = parsePutWeeklyBody(req.body);
	if (!body.ok) throw AppError.badRequest(body.error);

	const data = await upsertWeeklyDay(
		actor,
		params.data.instructorId,
		params.data.dayOfWeek,
		body.data,
	);
	return sendJsonSuccess(res, { entry: data });
}

async function deleteWeeklyDayHandler(req: Request, res: Response) {
	const actor = requireUser(req);

	const params = dayOfWeekParamsSchema.safeParse(req.params);
	if (!params.success) {
		throw AppError.badRequest(
			params.error.issues[0]?.message ?? 'Invalid params',
		);
	}

	await deleteWeeklyDay(
		actor,
		params.data.instructorId,
		params.data.dayOfWeek,
	);
	res.status(204).send();
}

// ── Exceptions ────────────────────────────────────────────────────────────────

async function getExceptions(req: Request, res: Response) {
	const actor = requireUser(req);

	const params = instructorIdParamsSchema.safeParse(req.params);
	if (!params.success) {
		throw AppError.badRequest(
			params.error.issues[0]?.message ?? 'Invalid params',
		);
	}

	const query = exceptionsQuerySchema.safeParse(req.query);
	if (!query.success) {
		throw AppError.badRequest(
			query.error.issues[0]?.message ?? 'Invalid query',
		);
	}

	const data = await listExceptions(
		actor,
		params.data.instructorId,
		query.data.from,
		query.data.to,
	);
	return sendJsonSuccess(res, { exceptions: data });
}

async function putExceptionHandler(req: Request, res: Response) {
	const actor = requireUser(req);

	const params = exceptionDateParamsSchema.safeParse(req.params);
	if (!params.success) {
		throw AppError.badRequest(
			params.error.issues[0]?.message ?? 'Invalid params',
		);
	}

	const body = parsePutExceptionBody(req.body);
	if (!body.ok) throw AppError.badRequest(body.error);

	const data = await upsertException(
		actor,
		params.data.instructorId,
		params.data.date,
		body.data,
	);
	return sendJsonSuccess(res, { exception: data });
}

async function deleteExceptionHandler(req: Request, res: Response) {
	const actor = requireUser(req);

	const params = exceptionDateParamsSchema.safeParse(req.params);
	if (!params.success) {
		throw AppError.badRequest(
			params.error.issues[0]?.message ?? 'Invalid params',
		);
	}

	await deleteException(actor, params.data.instructorId, params.data.date);
	res.status(204).send();
}

// ── Compute ───────────────────────────────────────────────────────────────────

async function computeAvailabilityHandler(req: Request, res: Response) {
	const actor = requireUser(req);

	const params = instructorIdParamsSchema.safeParse(req.params);
	if (!params.success) {
		throw AppError.badRequest(
			params.error.issues[0]?.message ?? 'Invalid params',
		);
	}

	const query = computeQuerySchema.safeParse(req.query);
	if (!query.success) {
		throw AppError.badRequest(
			query.error.issues[0]?.message ?? 'Invalid query',
		);
	}

	const data = await computeAvailability(
		actor,
		params.data.instructorId,
		query.data.date,
	);
	return sendJsonSuccess(res, data);
}

export {
	computeAvailabilityHandler,
	deleteExceptionHandler,
	deleteWeeklyDayHandler,
	getExceptions,
	getWeekly,
	putExceptionHandler,
	putWeeklyDay,
};
