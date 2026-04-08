import { Request, Response } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { AppError } from '../lib/http/AppError';
import { requireUser } from '../lib/http/requireUser';
import {
	instructorIdParamsSchema,
	schoolIdQuerySchema,
} from '../lib/validation/uuid';
import {
	getInstructorByIdForUser,
	listInstructorsBySchoolForUser,
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

export { getInstructorById, listInstructorsBySchool };
