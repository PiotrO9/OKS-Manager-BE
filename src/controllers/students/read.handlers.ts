import { Request, Response } from 'express';
import { sendJsonSuccess } from '../../lib/apiResponse';
import { requireUser } from '../../lib/http/requireUser';
import {
	listStudentsQuerySchema,
	studentDetailParamsSchema,
	studentDetailQuerySchema,
	studentEventsQuerySchema,
	studentProcessStatusQuerySchema,
} from '../../lib/validation/uuid';
import {
	getStudentDetail as fetchStudentDetail,
	getStudentProcessStatus as fetchStudentProcessStatus,
	listStudentInstructorEvents,
	listStudentsForSchool,
} from '../../services/students.service';
import { parseRequestPart } from '../requestParsing';

async function listStudents(req: Request, res: Response) {
	const user = requireUser(req);
	const query = parseRequestPart(listStudentsQuerySchema, req.query, 'query');
	const result = await listStudentsForSchool(user.id, user.role, query);
	return sendJsonSuccess(res, result);
}

async function getStudentDetail(req: Request, res: Response) {
	const user = requireUser(req);

	const params = parseRequestPart(
		studentDetailParamsSchema,
		req.params,
		'params',
	);
	const query = parseRequestPart(
		studentDetailQuerySchema,
		req.query,
		'query',
	);

	const data = await fetchStudentDetail(
		user.id,
		user.role,
		params.userId,
		query.schoolId,
	);
	return sendJsonSuccess(res, data);
}

async function getStudentEvents(req: Request, res: Response) {
	const user = requireUser(req);

	const params = parseRequestPart(
		studentDetailParamsSchema,
		req.params,
		'params',
	);
	const query = parseRequestPart(
		studentEventsQuerySchema,
		req.query,
		'query',
	);

	const data = await listStudentInstructorEvents(
		user.id,
		user.role,
		params.userId,
		query,
	);
	return sendJsonSuccess(res, data);
}

async function getStudentProcessStatus(req: Request, res: Response) {
	const user = requireUser(req);

	const params = parseRequestPart(
		studentDetailParamsSchema,
		req.params,
		'params',
	);
	const query = parseRequestPart(
		studentProcessStatusQuerySchema,
		req.query,
		'query',
	);

	const data = await fetchStudentProcessStatus(
		user.id,
		user.role,
		params.userId,
		query.schoolId,
	);
	return sendJsonSuccess(res, data);
}

export {
	getStudentDetail,
	getStudentEvents,
	getStudentProcessStatus,
	listStudents,
};
