import { Request, Response } from 'express';
import { Prisma, Role } from '@prisma/client';
import { sendJsonSuccess } from '../lib/apiResponse';
import { AppError } from '../lib/http/AppError';
import { requireUser } from '../lib/http/requireUser';
import { getPrisma } from '../lib/prisma';
import {
	assignStudentDrivingSchoolBodySchema,
	assignStudentToCourseBodySchema,
	patchStudentPkkBodySchema,
	studentUserIdParamsSchema,
} from '../lib/validation/uuid';
import {
	assignStudentDrivingSchoolForAdminOrManager,
	patchStudentPkkForStaff,
} from '../services/students.service';

const prisma = getPrisma();

async function patchStudentDrivingSchool(req: Request, res: Response) {
	const user = requireUser(req);
	const paramsParsed = studentUserIdParamsSchema.safeParse(req.params);
	if (!paramsParsed.success) {
		const message =
			paramsParsed.error.issues[0]?.message ?? 'Invalid params';
		throw AppError.badRequest(message);
	}

	const bodyParsed = assignStudentDrivingSchoolBodySchema.safeParse(req.body);
	if (!bodyParsed.success) {
		const message = bodyParsed.error.issues[0]?.message ?? 'Invalid body';
		throw AppError.badRequest(message);
	}

	const data = await assignStudentDrivingSchoolForAdminOrManager(
		user.id,
		user.role,
		paramsParsed.data.userId,
		bodyParsed.data.schoolId,
	);
	return sendJsonSuccess(res, data);
}

async function patchStudentPkk(req: Request, res: Response) {
	const user = requireUser(req);
	const paramsParsed = studentUserIdParamsSchema.safeParse(req.params);
	if (!paramsParsed.success) {
		const message =
			paramsParsed.error.issues[0]?.message ?? 'Invalid params';
		throw AppError.badRequest(message);
	}

	const bodyParsed = patchStudentPkkBodySchema.safeParse(req.body);
	if (!bodyParsed.success) {
		const message = bodyParsed.error.issues[0]?.message ?? 'Invalid body';
		throw AppError.badRequest(message);
	}

	const data = await patchStudentPkkForStaff(
		user.id,
		user.role,
		paramsParsed.data.userId,
		bodyParsed.data.pkkNumber,
	);
	return sendJsonSuccess(res, data);
}

async function assignStudentToCourse(req: Request, res: Response) {
	const actor = requireUser(req);

	const paramsParsed = studentUserIdParamsSchema.safeParse(req.params);
	if (!paramsParsed.success) {
		const message =
			paramsParsed.error.issues[0]?.message ?? 'Invalid params';
		throw AppError.badRequest(message);
	}

	const bodyParsed = assignStudentToCourseBodySchema.safeParse(req.body);
	if (!bodyParsed.success) {
		const message = bodyParsed.error.issues[0]?.message ?? 'Invalid body';
		throw AppError.badRequest(message);
	}

	const { userId } = paramsParsed.data;
	const { courseId } = bodyParsed.data;

	if (actor.role === Role.ADMIN) {
		throw AppError.forbidden('Forbidden');
	}

	const studentUser = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			id: true,
			role: true,
			deletedAt: true,
			isActive: true,
			studentProfile: { select: { id: true } },
		},
	});

	if (!studentUser || studentUser.deletedAt !== null) {
		throw AppError.notFound('User not found');
	}

	if (!studentUser.isActive) {
		throw AppError.forbidden('Account is disabled');
	}

	if (studentUser.role !== Role.STUDENT || !studentUser.studentProfile) {
		throw AppError.badRequest('User is not a student');
	}

	const studentProfileId = studentUser.studentProfile.id;

	const course = await prisma.course.findFirst({
		where: { id: courseId, deletedAt: null },
		select: { id: true, schoolId: true },
	});

	if (!course) {
		throw AppError.notFound('Course not found');
	}

	const studentInSchool = await prisma.studentSchool.findFirst({
		where: {
			student: { userId },
			schoolId: course.schoolId,
			school: { deletedAt: null },
		},
	});

	if (!studentInSchool) {
		throw AppError.forbidden('Forbidden');
	}

	if (actor.role === Role.MANAGER) {
		const ownsSchool = await prisma.drivingSchool.findFirst({
			where: { id: course.schoolId, ownerId: actor.id, deletedAt: null },
		});
		if (!ownsSchool) {
			throw AppError.forbidden('Forbidden');
		}
	} else {
		const instructorInSchool = await prisma.instructorSchool.findFirst({
			where: {
				instructor: { userId: actor.id },
				schoolId: course.schoolId,
				school: { deletedAt: null },
			},
		});
		if (!instructorInSchool) {
			throw AppError.forbidden('Forbidden');
		}
	}

	const existing = await prisma.courseParticipant.findFirst({
		where: { courseId, studentId: studentProfileId },
	});

	if (existing) {
		return sendJsonSuccess(res, { participant: existing });
	}

	try {
		const participant = await prisma.courseParticipant.create({
			data: { courseId, studentId: studentProfileId },
		});
		return sendJsonSuccess(res, { participant });
	} catch (err) {
		if (
			err instanceof Prisma.PrismaClientKnownRequestError &&
			err.code === 'P2002'
		) {
			const participant = await prisma.courseParticipant.findFirst({
				where: { courseId, studentId: studentProfileId },
			});
			return sendJsonSuccess(res, { participant });
		}
		throw err;
	}
}

export { assignStudentToCourse, patchStudentDrivingSchool, patchStudentPkk };
