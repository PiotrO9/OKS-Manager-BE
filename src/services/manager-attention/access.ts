import { Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';

const prisma = getPrisma();

export async function assertManagerCanAccessSchool(
	actorId: string,
	actorRole: Role,
	schoolId: string,
): Promise<void> {
	if (actorRole !== Role.MANAGER) {
		throw AppError.forbidden('Forbidden');
	}

	const school = await prisma.drivingSchool.findFirst({
		where: { id: schoolId, ownerId: actorId, deletedAt: null },
		select: { id: true },
	});

	if (!school) {
		throw AppError.forbidden('Forbidden');
	}
}
