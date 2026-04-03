import { Request, Response } from 'express';
import { sendJsonError, sendJsonSuccess } from '../lib/apiResponse';
import { getPrisma } from '../lib/prisma';

const prisma = getPrisma();

async function getDrivingSchools(req: Request, res: Response) {
	const user = (req as any).user;

	if (!user) {
		return sendJsonError(res, 'Unauthorized', 401);
	}

	const isOwnerScopeRole = user.role === 'ADMIN' || user.role === 'MANAGER';
	if (isOwnerScopeRole) {
		const schools = await prisma.drivingSchool.findMany({
			where: { ownerId: user.id },
		});

		return sendJsonSuccess(res, schools);
	}

	if (user.role === 'INSTRUCTOR') {
		const instructorProfile = await prisma.instructorProfile.findUnique({
			where: { userId: user.id },
			include: {
				instructorSchools: {
					include: { school: true },
				},
			},
		});

		if (!instructorProfile) {
			return sendJsonError(res, 'Instructor profile not found', 404);
		}

		const schools = instructorProfile.instructorSchools.map(
			(entry) => entry.school,
		);

		return sendJsonSuccess(res, schools);
	}

	if (user.role === 'STUDENT') {
		const studentProfile = await prisma.studentProfile.findUnique({
			where: { userId: user.id },
			include: {
				studentSchools: {
					include: { school: true },
				},
			},
		});

		if (!studentProfile) {
			return sendJsonError(res, 'Student profile not found', 404);
		}

		const schools = studentProfile.studentSchools.map(
			(entry) => entry.school,
		);

		return sendJsonSuccess(res, schools);
	}

	return sendJsonError(res, 'Forbidden', 403);
}

export { getDrivingSchools };
