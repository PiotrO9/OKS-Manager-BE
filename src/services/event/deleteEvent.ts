import type { Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import { assertActorCanManageAvailability } from '../instructor-availability.service';

const prisma = getPrisma();

export async function deleteInstructorEvent(
	actor: { id: string; role: Role },
	eventId: string,
): Promise<void> {
	const event = await prisma.instructorEvent.findUnique({
		where: { id: eventId },
		select: { instructorId: true, isActive: true },
	});

	if (!event) {
		throw AppError.notFound('Event not found');
	}
	if (!event.isActive) {
		throw AppError.badRequest('Event is already inactive');
	}

	await assertActorCanManageAvailability(actor, event.instructorId);

	await prisma.instructorEvent.update({
		where: { id: eventId },
		data: { isActive: false },
	});
}
