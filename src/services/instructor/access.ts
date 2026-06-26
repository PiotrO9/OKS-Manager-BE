import { Role, type Prisma } from '@prisma/client';

export const ACTIVE_INSTRUCTOR_USER_WHERE: Prisma.UserWhereInput = {
	role: Role.INSTRUCTOR,
	deletedAt: null,
	isActive: true,
};

export function activeInstructorProfileWhere(
	instructorId: string,
): Prisma.InstructorProfileWhereInput {
	return {
		id: instructorId,
		user: ACTIVE_INSTRUCTOR_USER_WHERE,
	};
}

export function activeInstructorUserByIdWhere(
	userId: string,
): Prisma.UserWhereInput {
	return {
		id: userId,
		...ACTIVE_INSTRUCTOR_USER_WHERE,
	};
}

export function hasInstructorSchoolOwnedByActor(
	instructorSchools: Array<{
		school: { ownerId: string; deletedAt: Date | null };
	}>,
	actorId: string,
): boolean {
	return instructorSchools.some(
		(row) => row.school.deletedAt === null && row.school.ownerId === actorId,
	);
}
