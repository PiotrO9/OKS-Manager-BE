import { Request, Response } from 'express';
import { sendJsonSuccess } from '../../lib/apiResponse';
import { requireUser } from '../../lib/http/requireUser';
import {
	assignStudentDrivingSchoolBodySchema,
	patchStudentBodySchema,
	patchStudentPkkBodySchema,
	studentUserIdParamsSchema,
} from '../../lib/validation/uuid';
import {
	assignStudentDrivingSchoolForAdminOrManager,
	patchStudentForStaff,
	patchStudentPkkForStaff,
} from '../../services/students.service';
import { parseRequestPart } from '../requestParsing';

async function patchStudent(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(
		studentUserIdParamsSchema,
		req.params,
		'params',
	);
	const body = parseRequestPart(patchStudentBodySchema, req.body, 'body');

	const data = await patchStudentForStaff(user.id, user.role, params.userId, {
		notes: body.notes,
	});
	return sendJsonSuccess(res, data);
}

async function patchStudentDrivingSchool(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(
		studentUserIdParamsSchema,
		req.params,
		'params',
	);
	const body = parseRequestPart(
		assignStudentDrivingSchoolBodySchema,
		req.body,
		'body',
	);

	const data = await assignStudentDrivingSchoolForAdminOrManager(
		user.id,
		user.role,
		params.userId,
		body.schoolId,
	);
	return sendJsonSuccess(res, data);
}

async function patchStudentPkk(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(
		studentUserIdParamsSchema,
		req.params,
		'params',
	);
	const body = parseRequestPart(patchStudentPkkBodySchema, req.body, 'body');

	const data = await patchStudentPkkForStaff(
		user.id,
		user.role,
		params.userId,
		body.pkkNumber,
	);
	return sendJsonSuccess(res, data);
}

export { patchStudent, patchStudentDrivingSchool, patchStudentPkk };
