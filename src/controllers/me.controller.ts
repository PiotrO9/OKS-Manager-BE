import { Request, Response } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { requireUser } from '../lib/http/requireUser';
import { courseService } from '../services/course.service';
import { listPaymentsForCurrentUser } from '../services/students.service';

async function listMyCourses(req: Request, res: Response) {
	const user = requireUser(req);
	const courses = await courseService.listCoursesForCurrentUser(
		user.id,
		user.role,
	);
	return sendJsonSuccess(res, { courses });
}

async function listMyPayments(req: Request, res: Response) {
	const user = requireUser(req);
	const data = await listPaymentsForCurrentUser(user.id, user.role);
	return sendJsonSuccess(res, data);
}

export { listMyCourses, listMyPayments };
