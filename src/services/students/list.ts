import { Role } from '@prisma/client';
import { buildStudentListWhere } from './listFilters';
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
	const { schoolId, courseId, page, limit, filters } = query;

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

	const advancedCourseIds = [
		...new Set(
			filters.flatMap((filter) => {
				if (
					filter.field === 'courseId' &&
					(filter.operator === 'eq' || filter.operator === 'neq') &&
					'value' in filter
				) {
					return [filter.value];
				}

				return [];
			}),
		),
	];

	if (advancedCourseIds.length > 0) {
		const courses = await prisma.course.findMany({
			where: {
				id: { in: advancedCourseIds },
				schoolId,
				deletedAt: null,
			},
			select: { id: true },
		});

		if (courses.length !== advancedCourseIds.length) {
			throw AppError.notFound('Course not found');
		}
	}

	const where = buildStudentListWhere(query);

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
						profile: { select: { avatarUrl: true } },
					},
				},
			},
			orderBy: [
				{ user: { lastName: 'asc' } },
				{ user: { firstName: 'asc' } },
				{ id: 'asc' },
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
		avatarUrl: row.user.profile?.avatarUrl ?? null,
		pkkNumber: row.pkkNumber,
		isActive: row.user.isActive,
		createdAt: row.createdAt,
	}));

	return { data, total, page, limit };
}
