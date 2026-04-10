import { Request, Response } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { AppError } from '../lib/http/AppError';
import { requireUser } from '../lib/http/requireUser';
import {
	assignStudentDrivingSchoolBodySchema,
	patchStudentPkkBodySchema,
	studentUserIdParamsSchema,
} from '../lib/validation/uuid';
import {
	assignStudentDrivingSchoolForAdminOrManager,
	patchStudentPkkForStaff,
} from '../services/students.service';

async function patchStudentDrivingSchool(req: Request, res: Response) {
	const user = requireUser(req);
	const paramsParsed = studentUserIdParamsSchema.safeParse(req.params);
	if (!paramsParsed.success) {
		const message =
			paramsParsed.error.issues[0]?.message ?? 'Invalid params';
		throw AppError.badRequest(message);
	}

	const bodyParsed = assignStudentDrivingSchoolBodySchema.safeParse(req.body);
	if (!bodyParsed.success) {
		const message = bodyParsed.error.issues[0]?.message ?? 'Invalid body';
		throw AppError.badRequest(message);
	}

	const data = await assignStudentDrivingSchoolForAdminOrManager(
		user.id,
		user.role,
		paramsParsed.data.userId,
		bodyParsed.data.schoolId,
	);
	return sendJsonSuccess(res, data);
}

async function patchStudentPkk(req: Request, res: Response) {
	const user = requireUser(req);
	const paramsParsed = studentUserIdParamsSchema.safeParse(req.params);
	if (!paramsParsed.success) {
		const message =
			paramsParsed.error.issues[0]?.message ?? 'Invalid params';
		throw AppError.badRequest(message);
	}

	const bodyParsed = patchStudentPkkBodySchema.safeParse(req.body);
	if (!bodyParsed.success) {
		const message = bodyParsed.error.issues[0]?.message ?? 'Invalid body';
		throw AppError.badRequest(message);
	}

	const data = await patchStudentPkkForStaff(
		user.id,
		user.role,
		paramsParsed.data.userId,
		bodyParsed.data.pkkNumber,
	);
	return sendJsonSuccess(res, data);
}

export { patchStudentDrivingSchool, patchStudentPkk };
