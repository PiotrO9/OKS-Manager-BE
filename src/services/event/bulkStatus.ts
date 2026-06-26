import { Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import type { BulkUpdateEventStatusBody } from '../../schemas/event.schemas';

const prisma = getPrisma();

export async function bulkUpdateEventStatus(
	actor: { id: string; role: Role },
	body: BulkUpdateEventStatusBody,
): Promise<{ updated: number; skipped: number }> {
	if (actor.role === Role.STUDENT) {
		throw AppError.forbidden('Forbidden');
	}

	const uniqueIds = [...new Set(body.eventIds)];

	const rows = await prisma.instructorEvent.findMany({
		where: { id: { in: uniqueIds }, isActive: true },
		select: { id: true, instructorId: true },
	});

	const allowed: string[] = [];

	if (actor.role === Role.ADMIN) {
		for (const r of rows) {
			allowed.push(r.id);
		}
	} else if (actor.role === Role.INSTRUCTOR) {
		const profile = await prisma.instructorProfile.findUnique({
			where: { userId: actor.id },
			select: { id: true },
		});
		if (!profile) {
			throw AppError.notFound('Instructor profile not found');
		}
		for (const r of rows) {
			if (r.instructorId === profile.id) {
				allowed.push(r.id);
			}
		}
	} else if (actor.role === Role.MANAGER) {
		const links = await prisma.instructorSchool.findMany({
			where: { school: { ownerId: actor.id, deletedAt: null } },
			select: { instructorId: true },
		});
		const allowedInstructorIds = new Set(links.map((l) => l.instructorId));
		for (const r of rows) {
			if (allowedInstructorIds.has(r.instructorId)) {
				allowed.push(r.id);
			}
		}
	} else {
		throw AppError.forbidden('Forbidden');
	}

	if (allowed.length === 0) {
		return { updated: 0, skipped: uniqueIds.length };
	}

	const result = await prisma.instructorEvent.updateMany({
		where: { id: { in: allowed } },
		data: { status: body.status },
	});

	return {
		updated: result.count,
		skipped: uniqueIds.length - result.count,
	};
}
