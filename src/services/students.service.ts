import { Prisma, Role } from '@prisma/client';
import { AppError } from '../lib/http/AppError';
import { getPrisma } from '../lib/prisma';
import {
	assertActorCanAssignStudentToSchoolForAdminOrManager,
	attachStudentToSchoolReplaceInTx,
} from '../lib/studentSchoolRegistration';

const prisma = getPrisma();

export type AssignStudentDrivingSchoolResult = {
	userId: string;
	drivingSchool: {
		id: string;
		name: string;
		city: string | null;
		address: string | null;
	};
};

export async function assignStudentDrivingSchoolForAdminOrManager(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	schoolId: string,
): Promise<AssignStudentDrivingSchoolResult> {
	if (actorRole !== Role.ADMIN && actorRole !== Role.MANAGER) {
		throw AppError.forbidden('Forbidden');
	}

	const studentUser = await prisma.user.findUnique({
		where: { id: studentUserId },
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

	await assertActorCanAssignStudentToSchoolForAdminOrManager(
		prisma,
		actorRole,
		actorId,
		schoolId,
	);

	await prisma.$transaction(async (tx) => {
		await attachStudentToSchoolReplaceInTx(tx, studentUserId, schoolId);
	});

	const drivingSchool = await prisma.drivingSchool.findUnique({
		where: { id: schoolId },
		select: {
			id: true,
			name: true,
			city: true,
			address: true,
		},
	});
	if (!drivingSchool) {
		throw AppError.notFound('Driving school not found');
	}

	return {
		userId: studentUserId,
		drivingSchool,
	};
}

async function assertActorCanPatchStudentPkk(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
): Promise<void> {
	if (actorRole === Role.ADMIN) {
		return;
	}
	if (actorRole !== Role.MANAGER && actorRole !== Role.INSTRUCTOR) {
		throw AppError.forbidden('Forbidden');
	}

	const studentSchools = await prisma.studentSchool.findMany({
		where: {
			student: { userId: studentUserId },
			school: { deletedAt: null },
		},
		select: { schoolId: true },
	});
	const schoolIds = studentSchools.map((row) => row.schoolId);
	if (schoolIds.length === 0) {
		throw AppError.forbidden('Forbidden');
	}

	if (actorRole === Role.MANAGER) {
		const ok = await prisma.studentSchool.findFirst({
			where: {
				student: { userId: studentUserId },
				school: { ownerId: actorId, deletedAt: null },
			},
		});
		if (!ok) {
			throw AppError.forbidden('Forbidden');
		}
		return;
	}

	const ok = await prisma.instructorSchool.findFirst({
		where: {
			instructor: { userId: actorId },
			schoolId: { in: schoolIds },
			school: { deletedAt: null },
		},
	});
	if (!ok) {
		throw AppError.forbidden('Forbidden');
	}
}

export type PatchStudentPkkResult = {
	userId: string;
	pkkNumber: string | null;
};

export async function patchStudentPkkForStaff(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	pkkNumber: string | null,
): Promise<PatchStudentPkkResult> {
	const studentUser = await prisma.user.findUnique({
		where: { id: studentUserId },
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

	await assertActorCanPatchStudentPkk(actorId, actorRole, studentUserId);

	try {
		await prisma.studentProfile.update({
			where: { userId: studentUserId },
			data: { pkkNumber },
		});
	} catch (err) {
		if (
			err instanceof Prisma.PrismaClientKnownRequestError &&
			err.code === 'P2002'
		) {
			throw AppError.conflict('PKK number already in use');
		}
		throw err;
	}

	return { userId: studentUserId, pkkNumber };
}
