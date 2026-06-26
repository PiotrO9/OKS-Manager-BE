import { Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import type { ScheduleActor } from './types';

const prisma = getPrisma();

export async function assertActorCanReadSchoolSchedule(
	actor: ScheduleActor,
	schoolId: string,
): Promise<void> {
	if (actor.role === Role.ADMIN) {
		return;
	}

	const school = await prisma.drivingSchool.findFirst({
		where: { id: schoolId, ownerId: actor.id, deletedAt: null },
		select: { id: true },
	});

	if (!school) {
		throw AppError.forbidden('Forbidden');
	}
}
