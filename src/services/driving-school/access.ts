import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';

const prisma = getPrisma();

export async function loadOwnedActiveDrivingSchoolOrThrow(
	userId: string,
	id: string,
) {
	const school = await prisma.drivingSchool.findUnique({
		where: { id },
	});

	if (!school || school.deletedAt !== null) {
		throw AppError.notFound('Driving school not found');
	}

	if (school.ownerId !== userId) {
		throw AppError.forbidden('Forbidden');
	}

	return school;
}
