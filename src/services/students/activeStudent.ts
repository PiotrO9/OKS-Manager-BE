import { Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';

const prisma = getPrisma();

export async function loadActiveStudentProfileId(
	studentUserId: string,
): Promise<string> {
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

	return studentUser.studentProfile.id;
}
