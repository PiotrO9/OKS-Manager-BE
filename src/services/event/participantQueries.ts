import type { Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import { assertActorCanManageAvailability } from '../instructor-availability.service';

const prisma = getPrisma();

export async function getEventStudentUserIds(
	actor: { id: string; role: Role },
	eventId: string,
): Promise<{ studentUserIds: string[] }> {
	const event = await prisma.instructorEvent.findUnique({
		where: { id: eventId },
		select: { instructorId: true, isActive: true },
	});

	if (!event) {
		throw AppError.notFound('Event not found');
	}
	if (!event.isActive) {
		throw AppError.notFound('Event not found');
	}

	await assertActorCanManageAvailability(actor, event.instructorId);

	const rows = await prisma.eventParticipant.findMany({
		where: { eventId },
		orderBy: { createdAt: 'asc' },
		select: {
			student: {
				select: { userId: true },
			},
		},
	});

	return {
		studentUserIds: rows.map((r) => r.student.userId),
	};
}
