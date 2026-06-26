import { Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import type { InstructorMeta } from './types';

const prisma = getPrisma();

export async function loadSchoolInstructorSelection(
	schoolId: string,
	requestedInstructorIds?: string[],
): Promise<{
	instructorIds: string[];
	metaById: Map<string, InstructorMeta>;
}> {
	const rows = await prisma.instructorSchool.findMany({
		where: {
			schoolId,
			instructor: {
				user: {
					deletedAt: null,
					isActive: true,
					role: Role.INSTRUCTOR,
				},
			},
		},
		select: {
			instructor: {
				select: {
					id: true,
					user: {
						select: { firstName: true, lastName: true },
					},
				},
			},
		},
		orderBy: {
			instructor: { createdAt: 'asc' },
		},
	});

	const metaById = new Map<string, InstructorMeta>();
	let instructorIds = rows.map((r) => {
		const id = r.instructor.id;
		metaById.set(id, {
			firstName: r.instructor.user.firstName,
			lastName: r.instructor.user.lastName,
		});
		return id;
	});

	if (requestedInstructorIds?.length) {
		const allowed = new Set(instructorIds);
		for (const id of requestedInstructorIds) {
			if (!allowed.has(id)) {
				throw AppError.badRequest('Invalid instructorIds');
			}
		}
		instructorIds = requestedInstructorIds;
	}

	return { instructorIds, metaById };
}
