import type { DrivingSchool } from '@prisma/client';
import { getPrisma } from '../../lib/prisma';

const prisma = getPrisma();

export async function getSchoolOwnedByUser(
	userId: string,
	schoolId: string,
): Promise<DrivingSchool | null> {
	const school = await prisma.drivingSchool.findUnique({
		where: { id: schoolId },
	});
	if (!school || school.deletedAt !== null || school.ownerId !== userId) {
		return null;
	}
	return school;
}
