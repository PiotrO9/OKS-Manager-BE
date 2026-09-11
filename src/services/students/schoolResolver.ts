import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';

const prisma = getPrisma();

export async function resolveActiveStudentSchoolId(
	studentUserId: string,
): Promise<string> {
	const links = await prisma.studentSchool.findMany({
		where: {
			student: { userId: studentUserId, user: { deletedAt: null } },
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
