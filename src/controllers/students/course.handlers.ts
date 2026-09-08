import { Request, Response } from 'express';
import { sendJsonSuccess } from '../../lib/apiResponse';
import { requireUser } from '../../lib/http/requireUser';
import {
	assignStudentToCourseBodySchema,
	patchCourseParticipantStatusBodySchema,
	studentCourseParamsSchema,
	studentUserIdParamsSchema,
} from '../../lib/validation/uuid';
import {
	assignStudentToCourseForStaff,
	patchCourseParticipantStatusForStaff,
} from '../../services/students.service';
import { parseRequestPart } from '../requestParsing';

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

export { assignStudentToCourse, patchCourseParticipantStatus };
