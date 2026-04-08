import { Request, Response } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { AppError } from '../lib/http/AppError';
import { requireUser } from '../lib/http/requireUser';
import { schoolIdQuerySchema } from '../lib/validation/uuid';
import { parseCreateCourseBody } from '../schemas/course.schemas';
import { courseService } from '../services/course.service';

async function listCourses(req: Request, res: Response) {
	const user = requireUser(req);
	const parsed = schoolIdQuerySchema.safeParse(req.query);
	if (!parsed.success) {
		const message = parsed.error.issues[0]?.message ?? 'Invalid query';
		throw AppError.badRequest(message);
	}

	const courses = await courseService.listCoursesForSchool(
		user.id,
		parsed.data.schoolId,
	);
	return sendJsonSuccess(res, { courses });
}

async function createCourse(req: Request, res: Response) {
	const user = requireUser(req);
	const parsed = parseCreateCourseBody(req.body);
	if (!parsed.ok) {
		throw AppError.badRequest(parsed.error);
	}

	const data = await courseService.createCourseForUser(user.id, parsed.data);
	return sendJsonSuccess(res, data);
}

export { createCourse, listCourses };
