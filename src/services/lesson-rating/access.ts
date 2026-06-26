import { Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import type { Actor } from './types';

const prisma = getPrisma();

export async function assertManagerCanAccessSchool(
	actor: Actor,
	schoolId: string,
): Promise<void> {
	if (actor.role !== Role.ADMIN && actor.role !== Role.MANAGER) {
		throw AppError.forbidden('Forbidden');
	}

	const school = await prisma.drivingSchool.findUnique({
		where: { id: schoolId },
		select: { id: true, ownerId: true, deletedAt: true },
	});

	if (!school || school.deletedAt !== null) {
		throw AppError.badRequest('Invalid schoolId');
	}

	if (actor.role === Role.MANAGER && school.ownerId !== actor.id) {
		throw AppError.forbidden('Forbidden');
	}
}

export async function resolveActiveInstructorProfileId(
	actor: Actor,
): Promise<string> {
	if (actor.role !== Role.INSTRUCTOR) {
		throw AppError.forbidden('Forbidden');
	}

	const profile = await prisma.instructorProfile.findFirst({
		where: {
			userId: actor.id,
			user: {
				role: Role.INSTRUCTOR,
				deletedAt: null,
				isActive: true,
			},
		},
		select: { id: true },
	});

	if (!profile) {
		throw AppError.notFound('Instructor profile not found');
	}

	return profile.id;
}
