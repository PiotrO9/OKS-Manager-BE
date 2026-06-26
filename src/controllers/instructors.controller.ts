import { Request, Response } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { requireUser } from '../lib/http/requireUser';
import { instructorAdminPatchBodySchema } from '../lib/validation/instructorAdminPatch';
import {
	assignInstructorToSchoolBodySchema,
	instructorIdParamsSchema,
	schoolIdQuerySchema,
} from '../lib/validation/uuid';
import {
	assignInstructorToSchoolForManagerOrAdmin,
	getInstructorByIdForUser,
	listInstructorsBySchoolForUser,
	softDeleteInstructorForManagerOrAdmin,
	updateInstructorForManagerOrAdmin,
} from '../services/instructor.service';
import { parseRequestPart } from './requestParsing';

async function listInstructorsBySchool(req: Request, res: Response) {
	const user = requireUser(req);
	const query = parseRequestPart(schoolIdQuerySchema, req.query, 'query');

	const data = await listInstructorsBySchoolForUser(
		{ id: user.id, role: user.role },
		query.schoolId,
	);
	return sendJsonSuccess(res, data);
}

async function getInstructorById(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(
		instructorIdParamsSchema,
		req.params,
		'params',
	);

	const data = await getInstructorByIdForUser(
		{ id: user.id, role: user.role },
		params.id,
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
	const params = parseRequestPart(
		instructorIdParamsSchema,
		req.params,
		'params',
	);
	const body = parseRequestPart(
		instructorAdminPatchBodySchema,
		normalizePatchBody(req.body),
		'body',
	);

	const data = await updateInstructorForManagerOrAdmin(
		{ id: user.id, role: user.role },
		params.id,
		body,
	);
	return sendJsonSuccess(res, data);
}

async function deleteInstructor(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(
		instructorIdParamsSchema,
		req.params,
		'params',
	);

	await softDeleteInstructorForManagerOrAdmin(
		{ id: user.id, role: user.role },
		params.id,
	);
	return res.status(204).send();
}

async function assignInstructorToSchool(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(
		instructorIdParamsSchema,
		req.params,
		'params',
	);
	const body = parseRequestPart(
		assignInstructorToSchoolBodySchema,
		req.body,
		'body',
	);

	const data = await assignInstructorToSchoolForManagerOrAdmin(
		{ id: user.id, role: user.role },
		params.id,
		body.schoolId,
	);
	return sendJsonSuccess(res, data, 201);
}

export {
	assignInstructorToSchool,
	deleteInstructor,
	getInstructorById,
	listInstructorsBySchool,
	patchInstructor,
};
