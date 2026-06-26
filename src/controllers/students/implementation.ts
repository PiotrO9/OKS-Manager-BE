import { Request, Response } from 'express';
import { sendJsonSuccess } from '../../lib/apiResponse';
import { requireUser } from '../../lib/http/requireUser';
import {
	assignStudentDrivingSchoolBodySchema,
	assignStudentToCourseBodySchema,
	listStudentsQuerySchema,
	patchCourseParticipantStatusBodySchema,
	patchStudentBodySchema,
	patchStudentPkkBodySchema,
	studentCourseParamsSchema,
	studentDetailParamsSchema,
	studentDetailQuerySchema,
	studentEventsQuerySchema,
	studentPaymentsQuerySchema,
	studentProcessStatusQuerySchema,
	studentUserIdParamsSchema,
} from '../../lib/validation/uuid';
import {
	assignStudentDrivingSchoolForAdminOrManager,
	assignStudentToCourseForStaff,
	getStudentDetail as fetchStudentDetail,
	getStudentProcessStatus as fetchStudentProcessStatus,
	listStudentInstructorEvents,
	listStudentPayments as fetchStudentPayments,
	listStudentsForSchool,
	patchCourseParticipantStatusForStaff,
	patchStudentForStaff,
	patchStudentPkkForStaff,
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

async function getStudentPayments(req: Request, res: Response) {
	const user = requireUser(req);

	const params = parseRequestPart(
		studentDetailParamsSchema,
		req.params,
		'params',
	);
	const query = parseRequestPart(
		studentPaymentsQuerySchema,
		req.query,
		'query',
	);

	const data = await fetchStudentPayments(
		user.id,
		user.role,
		params.userId,
		query,
	);
	return sendJsonSuccess(res, data);
}

async function patchStudent(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(
		studentUserIdParamsSchema,
		req.params,
		'params',
	);
	const body = parseRequestPart(patchStudentBodySchema, req.body, 'body');

	const data = await patchStudentForStaff(
		user.id,
		user.role,
		params.userId,
		{ notes: body.notes },
	);
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

async function assignStudentToCourse(req: Request, res: Response) {
	const actor = requireUser(req);

	const { userId } = parseRequestPart(
		studentUserIdParamsSchema,
		req.params,
		'params',
	);
	const { courseId } = parseRequestPart(
		assignStudentToCourseBodySchema,
		req.body,
		'body',
	);

	const participant = await assignStudentToCourseForStaff(
		actor.id,
		actor.role,
		userId,
		courseId,
	);

	return sendJsonSuccess(res, { participant });
}

async function patchCourseParticipantStatus(req: Request, res: Response) {
	const actor = requireUser(req);

	const params = parseRequestPart(
		studentCourseParamsSchema,
		req.params,
		'params',
	);
	const body = parseRequestPart(
		patchCourseParticipantStatusBodySchema,
		req.body,
		'body',
	);

	const participant = await patchCourseParticipantStatusForStaff(
		actor.id,
		actor.role,
		params.userId,
		params.courseId,
		body.status,
	);

	return sendJsonSuccess(res, { participant });
}

export {
	assignStudentToCourse,
	getStudentDetail,
	getStudentEvents,
	getStudentPayments,
	getStudentProcessStatus,
	listStudents,
	patchCourseParticipantStatus,
	patchStudent,
	patchStudentDrivingSchool,
	patchStudentPkk,
};
