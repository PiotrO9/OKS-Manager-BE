import { Request, Response } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { AppError } from '../lib/http/AppError';
import { requireUser } from '../lib/http/requireUser';
import { instructorAdminPatchBodySchema } from '../lib/validation/instructorAdminPatch';
import {
	instructorIdParamsSchema,
	schoolIdQuerySchema,
} from '../lib/validation/uuid';
import {
	getInstructorByIdForUser,
	listInstructorsBySchoolForUser,
	softDeleteInstructorForManagerOrAdmin,
	updateInstructorForManagerOrAdmin,
} from '../services/instructor.service';

async function listInstructorsBySchool(req: Request, res: Response) {
	const user = requireUser(req);
	const parsed = schoolIdQuerySchema.safeParse(req.query);
	if (!parsed.success) {
		const message = parsed.error.issues[0]?.message ?? 'Invalid query';
		throw AppError.badRequest(message);
	}

	const data = await listInstructorsBySchoolForUser(
		{ id: user.id, role: user.role },
		parsed.data.schoolId,
	);
	return sendJsonSuccess(res, data);
}

async function getInstructorById(req: Request, res: Response) {
	const user = requireUser(req);
	const parsed = instructorIdParamsSchema.safeParse(req.params);
	if (!parsed.success) {
		const message = parsed.error.issues[0]?.message ?? 'Invalid params';
		throw AppError.badRequest(message);
	}

	const data = await getInstructorByIdForUser(
		{ id: user.id, role: user.role },
		parsed.data.id,
	);
	return sendJsonSuccess(res, data);
}

function normalizePatchBody(raw: unknown): unknown {
	if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
		return raw;
	}
	return {};
}

async function patchInstructor(req: Request, res: Response) {
	const user = requireUser(req);
	const paramsParsed = instructorIdParamsSchema.safeParse(req.params);
	if (!paramsParsed.success) {
		const message =
			paramsParsed.error.issues[0]?.message ?? 'Invalid params';
		throw AppError.badRequest(message);
	}

	const bodyParsed = instructorAdminPatchBodySchema.safeParse(
		normalizePatchBody(req.body),
	);
	if (!bodyParsed.success) {
		const message = bodyParsed.error.issues[0]?.message ?? 'Invalid body';
		throw AppError.badRequest(message);
	}

	const data = await updateInstructorForManagerOrAdmin(
		{ id: user.id, role: user.role },
		paramsParsed.data.id,
		bodyParsed.data,
	);
	return sendJsonSuccess(res, data);
}

async function deleteInstructor(req: Request, res: Response) {
	const user = requireUser(req);
	const paramsParsed = instructorIdParamsSchema.safeParse(req.params);
	if (!paramsParsed.success) {
		const message =
			paramsParsed.error.issues[0]?.message ?? 'Invalid params';
		throw AppError.badRequest(message);
	}

	await softDeleteInstructorForManagerOrAdmin(
		{ id: user.id, role: user.role },
		paramsParsed.data.id,
	);
	return res.status(204).send();
}

export {
	deleteInstructor,
	getInstructorById,
	listInstructorsBySchool,
	patchInstructor,
};
