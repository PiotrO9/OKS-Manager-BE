import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';

const prisma = getPrisma();

export async function resolveActiveStudentSchoolId(
	studentUserId: string,
	db: Prisma.TransactionClient = prisma,
): Promise<string> {
	return resolveStudentSchool(
		{ userId: studentUserId, user: { deletedAt: null } },
		db,
	);
}

export async function resolveStudentSchoolByProfileId(
	studentId: string,
): Promise<string> {
	return resolveStudentSchool(
		{ id: studentId, user: { deletedAt: null } },
		prisma,
	);
}

async function resolveStudentSchool(
	student: Prisma.StudentProfileWhereInput,
	db: Prisma.TransactionClient,
): Promise<string> {
	const links = await db.studentSchool.findMany({
		where: {
			student,
			school: { deletedAt: null },
		},
		select: { schoolId: true },
	});

	if (links.length === 0) {
		throw AppError.notFound('Student not found');
	}

	if (links.length > 1) {
		throw AppError.conflict(
			'Student is assigned to multiple active driving schools',
		);
	}

	return links[0]!.schoolId;
}
