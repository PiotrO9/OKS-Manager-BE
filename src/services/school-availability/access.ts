import { Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import type { Actor, SchoolSlotAccess } from './types';

const prisma = getPrisma();

export async function loadSchoolAndAssertSlotAccess(
	actor: Actor,
	schoolId: string,
): Promise<SchoolSlotAccess> {
	const school = await prisma.drivingSchool.findFirst({
		where: { id: schoolId, deletedAt: null },
		select: {
			id: true,
			ownerId: true,
			settings: {
				select: {
					slotDurationMinutes: true,
					bookingMaxDaysAhead: true,
				},
			},
		},
	});

	if (!school) {
		throw AppError.notFound('Driving school not found');
	}

	switch (actor.role) {
	case Role.ADMIN:
		break;
	case Role.MANAGER:
		if (school.ownerId !== actor.id) {
			throw AppError.forbidden('Forbidden');
		}
		break;
	case Role.STUDENT: {
		const link = await prisma.studentSchool.findFirst({
			where: {
				schoolId: school.id,
				student: { userId: actor.id },
			},
			select: { id: true },
		});
		if (!link) {
			throw AppError.forbidden('Forbidden');
		}
		break;
	}
	case Role.INSTRUCTOR: {
		const link = await prisma.instructorSchool.findFirst({
			where: {
				schoolId: school.id,
				instructor: { userId: actor.id },
			},
			select: { id: true },
		});
		if (!link) {
			throw AppError.forbidden('Forbidden');
		}
		break;
	}
	default:
		throw AppError.forbidden('Forbidden');
	}

	const slotDurationMinutes = school.settings?.slotDurationMinutes ?? 60;
	const bookingMaxDaysAhead = school.settings?.bookingMaxDaysAhead ?? 30;

	return {
		id: school.id,
		slotDurationMinutes,
		bookingMaxDaysAhead,
	};
}
