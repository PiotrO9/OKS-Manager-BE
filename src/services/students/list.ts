import { Prisma, Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import type { ListStudentsQuery } from '../../lib/validation/uuid';
import { assertActorCanListStudentsForSchool } from './access';
import type { ListStudentsResult, StudentListItemDto } from './types';

const prisma = getPrisma();

export async function listStudentsForSchool(
	actorId: string,
	actorRole: Role,
	query: ListStudentsQuery,
): Promise<ListStudentsResult> {
	const { schoolId, courseId, page, limit } = query;

	await assertActorCanListStudentsForSchool(actorId, actorRole, schoolId);

	if (courseId) {
		const course = await prisma.course.findFirst({
			where: { id: courseId, schoolId, deletedAt: null },
			select: { id: true },
		});
		if (!course) {
			throw AppError.notFound('Course not found');
		}
	}

	const where: Prisma.StudentProfileWhereInput = {
		user: { deletedAt: null },
		studentSchools: {
			some: { schoolId, school: { deletedAt: null } },
		},
		...(courseId ? { courseParticipants: { some: { courseId } } } : {}),
	};

	const [rows, total] = await prisma.$transaction([
		prisma.studentProfile.findMany({
			where,
			select: {
				id: true,
				pkkNumber: true,
				createdAt: true,
				user: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						email: true,
						phone: true,
						isActive: true,
					},
				},
			},
			orderBy: [
				{ user: { lastName: 'asc' } },
				{ user: { firstName: 'asc' } },
			],
			skip: (page - 1) * limit,
			take: limit,
		}),
		prisma.studentProfile.count({ where }),
	]);

	const data: StudentListItemDto[] = rows.map((row) => ({
		id: row.id,
		userId: row.user.id,
		firstName: row.user.firstName,
		lastName: row.user.lastName,
		email: row.user.email,
		phone: row.user.phone,
		pkkNumber: row.pkkNumber,
		isActive: row.user.isActive,
		createdAt: row.createdAt,
	}));

	return { data, total, page, limit };
}
