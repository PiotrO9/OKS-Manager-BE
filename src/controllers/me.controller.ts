import { Request, Response } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { requireUser } from '../lib/http/requireUser';
import { courseService } from '../services/course.service';

async function listMyCourses(req: Request, res: Response) {
	const user = requireUser(req);
	const courses = await courseService.listCoursesForCurrentUser(
		user.id,
		user.role,
	);
	return sendJsonSuccess(res, { courses });
}

export { listMyCourses };
