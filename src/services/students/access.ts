import { Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';

const prisma = getPrisma();

export async function assertActorCanPatchStudentPkk(
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

export async function assertActorCanListStudentsForSchool(
	actorId: string,
	actorRole: Role,
	schoolId: string,
): Promise<void> {
	if (actorRole === Role.ADMIN) {
		return;
	}

	if (actorRole === Role.MANAGER) {
		const ownsSchool = await prisma.drivingSchool.findFirst({
			where: { id: schoolId, ownerId: actorId, deletedAt: null },
			select: { id: true },
		});
		if (!ownsSchool) {
			throw AppError.forbidden('Forbidden');
		}
		return;
	}

	if (actorRole === Role.INSTRUCTOR) {
		const instructorInSchool = await prisma.instructorSchool.findFirst({
			where: {
				instructor: { userId: actorId },
				schoolId,
				school: { deletedAt: null },
			},
			select: { id: true },
		});
		if (!instructorInSchool) {
			throw AppError.forbidden('Forbidden');
		}
		return;
	}

	throw AppError.forbidden('Forbidden');
}
