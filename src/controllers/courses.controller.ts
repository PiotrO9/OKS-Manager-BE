import { Request, Response } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { requireUser } from '../lib/http/requireUser';
import {
	courseIdParamsSchema,
	schoolIdQuerySchema,
} from '../lib/validation/uuid';
import {
	parseCreateCourseBody,
	parsePatchCourseBody,
} from '../schemas/course.schemas';
import { courseService } from '../services/course.service';
import { parseBodyWithParser, parseRequestPart } from './requestParsing';

async function listCourses(req: Request, res: Response) {
	const user = requireUser(req);
	const query = parseRequestPart(schoolIdQuerySchema, req.query, 'query');

	const courses = await courseService.listCoursesForSchool(
		user.id,
		query.schoolId,
	);
	return sendJsonSuccess(res, { courses });
}

async function createCourse(req: Request, res: Response) {
	const user = requireUser(req);
	const body = parseBodyWithParser(parseCreateCourseBody, req.body);

	const data = await courseService.createCourseForUser(user.id, body);
	return sendJsonSuccess(res, data);
}

async function getCourseById(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(courseIdParamsSchema, req.params, 'params');

	const course = await courseService.getCourseDetailForOwner(
		user.id,
		params.id,
	);
	return sendJsonSuccess(res, { course });
}

async function patchCourse(req: Request, res: Response) {
	const user = requireUser(req);
	const params = parseRequestPart(courseIdParamsSchema, req.params, 'params');
	const body = parseBodyWithParser(parsePatchCourseBody, req.body);

	const course = await courseService.patchCourseInstructorForOwner(
		user.id,
		params.id,
		body,
	);
	return sendJsonSuccess(res, { course });
}

export { createCourse, getCourseById, listCourses, patchCourse };
