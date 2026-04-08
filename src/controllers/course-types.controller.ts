import { Request, Response } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { requireUser } from '../lib/http/requireUser';
import { getPrisma } from '../lib/prisma';

const prisma = getPrisma();

async function getCourseTypes(req: Request, res: Response) {
	requireUser(req);
	const courseTypes = await prisma.courseType.findMany({
		orderBy: { code: 'asc' },
		select: { id: true, code: true, name: true },
	});
	return sendJsonSuccess(res, { courseTypes });
}

export { getCourseTypes };
