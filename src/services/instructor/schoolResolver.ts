import { Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import type { Actor } from './types';

const prisma = getPrisma();

export type InstructorSchoolContext = {
	schoolId: string;
	ownerId: string;
};

export async function resolveActiveInstructorSchoolContext(
	actor: Actor,
	instructorId: string,
): Promise<InstructorSchoolContext> {
	const links = await prisma.instructorSchool.findMany({
		where: {
			instructorId,
			school: { deletedAt: null },
		},
		select: {
			schoolId: true,
			school: { select: { ownerId: true } },
		},
	});

	if (links.length === 0) {
		throw AppError.notFound('Instructor not found');
	}

	if (links.length > 1) {
		throw AppError.conflict(
			'Instructor is assigned to multiple active driving schools',
		);
	}

	const link = links[0]!;

	if (actor.role === Role.MANAGER && link.school.ownerId !== actor.id) {
		throw AppError.forbidden('Forbidden');
	}

	return { schoolId: link.schoolId, ownerId: link.school.ownerId };
}
