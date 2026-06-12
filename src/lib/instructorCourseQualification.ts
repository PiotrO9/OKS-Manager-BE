import { Role, type Prisma } from '@prisma/client';
import { AppError } from './http/AppError';
import { getPrisma } from './prisma';

type DbClient = Prisma.TransactionClient | ReturnType<typeof getPrisma>;

const prisma = getPrisma();

export const INSTRUCTOR_COURSE_QUALIFICATION_ERROR =
	'Instructor is not qualified for this course category';

export async function assertInstructorQualifiedForCourseType(
	instructorId: string,
	courseTypeId: string,
	db: DbClient = prisma,
): Promise<void> {
	const profile = await db.instructorProfile.findFirst({
		where: {
			id: instructorId,
			user: {
				role: Role.INSTRUCTOR,
				deletedAt: null,
				isActive: true,
			},
			qualifiedCourseTypes: {
				some: { id: courseTypeId },
			},
		},
		select: { id: true },
	});

	if (!profile) {
		throw AppError.badRequest(INSTRUCTOR_COURSE_QUALIFICATION_ERROR);
	}
}

export async function assertInstructorQualifiedForCourse(
	instructorId: string,
	courseId: string,
	db: DbClient = prisma,
): Promise<void> {
	const course = await db.course.findFirst({
		where: { id: courseId, deletedAt: null },
		select: { courseTypeId: true },
	});

	if (!course) {
		throw AppError.notFound('Course not found');
	}

	await assertInstructorQualifiedForCourseType(
		instructorId,
		course.courseTypeId,
		db,
	);
}

export async function filterInstructorIdsQualifiedForCourseType(
	instructorIds: string[],
	courseTypeId: string,
	db: DbClient = prisma,
): Promise<string[]> {
	const uniqueInstructorIds = [...new Set(instructorIds)];

	if (uniqueInstructorIds.length === 0) {
		return [];
	}

	const rows = await db.instructorProfile.findMany({
		where: {
			id: { in: uniqueInstructorIds },
			user: {
				role: Role.INSTRUCTOR,
				deletedAt: null,
				isActive: true,
			},
			qualifiedCourseTypes: {
				some: { id: courseTypeId },
			},
		},
		select: { id: true },
	});
	const allowed = new Set(rows.map((row) => row.id));

	return instructorIds.filter((id) => allowed.has(id));
}
