import { Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import type { Actor } from './types';

const prisma = getPrisma();

export async function assertActorCanManageAvailability(
	actor: Actor,
	instructorId: string,
): Promise<void> {
	if (actor.role === Role.ADMIN) return;
	if (actor.role !== Role.MANAGER) throw AppError.forbidden('Forbidden');

	const link = await prisma.instructorSchool.findFirst({
		where: {
			instructorId,
			school: { ownerId: actor.id, deletedAt: null },
		},
		select: { id: true },
	});

	if (!link) throw AppError.forbidden('Forbidden');
}

export async function resolveActiveInstructorProfile(
	instructorId: string,
): Promise<string> {
	const profile = await prisma.instructorProfile.findFirst({
		where: {
			id: instructorId,
			user: { deletedAt: null, isActive: true, role: Role.INSTRUCTOR },
		},
		select: { id: true },
	});

	if (!profile) throw AppError.notFound('Instructor not found');
	return profile.id;
}
