import { assertVehicleSupportsCourse } from '../../lib/vehicleCourseCategories';
import { runScheduleWriteTransaction } from '../schedule-validation/transaction';
import { Role, EventStatus, EventType } from '@prisma/client';
import { ScheduleDomainError } from '../../lib/http/ScheduleDomainError';
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

	const events = await prisma.instructorEvent.findMany({
		where: { id: { in: uniqueIds }, isActive: true },
		select: { id: true, instructorId: true },
	});

	const allowedEventIds: string[] = [];

	if (actor.role === Role.ADMIN) {
		for (const event of events) {
			allowedEventIds.push(event.id);
		}
	} else if (actor.role === Role.INSTRUCTOR) {
		const profile = await prisma.instructorProfile.findUnique({
			where: { userId: actor.id },
			select: { id: true },
		});
		if (!profile) {
			throw AppError.notFound('Instructor profile not found');
		}
		for (const event of events) {
			if (event.instructorId === profile.id) {
				allowedEventIds.push(event.id);
			}
		}
	} else if (actor.role === Role.MANAGER) {
		const links = await prisma.instructorSchool.findMany({
			where: { school: { ownerId: actor.id, deletedAt: null } },
			select: { instructorId: true },
		});
		const allowedInstructorIds = new Set(
			links.map((link) => link.instructorId),
		);
		for (const event of events) {
			if (allowedInstructorIds.has(event.instructorId)) {
				allowedEventIds.push(event.id);
			}
		}
	} else {
		throw AppError.forbidden('Forbidden');
	}

	if (allowedEventIds.length === 0) {
		return { updated: 0, skipped: uniqueIds.length };
	}

	const result = await runScheduleWriteTransaction(async (tx) => {
		if (body.status === EventStatus.PLANNED) {
			const drives = await tx.instructorEvent.findMany({
				where: {
					id: { in: allowedEventIds },
					type: EventType.DRIVE,
					courseId: { not: null },
				},
				select: { vehicleId: true, courseId: true },
			});
			for (const drive of drives) {
				if (!drive.vehicleId)
					throw ScheduleDomainError.badRequestFor(
						'VEHICLE_UNAVAILABLE',
						'Wybierz pojazd dla jazdy.',
					);
				if (drive.courseId && drive.vehicleId)
					await assertVehicleSupportsCourse(
						tx,
						drive.vehicleId,
						drive.courseId,
					);
			}
		}
		return tx.instructorEvent.updateMany({
			where: { id: { in: allowedEventIds } },
			data: { status: body.status },
		});
	});

	return {
		updated: result.count,
		skipped: uniqueIds.length - result.count,
	};
}
