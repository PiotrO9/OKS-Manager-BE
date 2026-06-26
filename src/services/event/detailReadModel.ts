import type { Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import {
	assertActorCanManageAvailability,
	computeDayWindows,
} from '../instructor-availability.service';
import { mapPersonToLessonDetailDto } from '../lesson.service';
import type { InstructorEventWithDetailsDto } from './mappers';
import { utcDayFreeWindowsToIso } from './readModelDate';

const prisma = getPrisma();

export async function getInstructorEventById(
	actor: { id: string; role: Role },
	eventId: string,
	opts?: { includeSlots?: boolean },
): Promise<{ event: InstructorEventWithDetailsDto }> {
	const row = await prisma.instructorEvent.findUnique({
		where: { id: eventId },
		select: {
			id: true,
			instructorId: true,
			isActive: true,
			courseId: true,
			type: true,
			status: true,
			startTime: true,
			endTime: true,
			capacity: true,
			createdAt: true,
			instructor: {
				select: {
					id: true,
					userId: true,
					user: {
						select: {
							firstName: true,
							lastName: true,
							email: true,
							phone: true,
						},
					},
				},
			},
			participants: {
				orderBy: { createdAt: 'asc' },
				select: {
					student: {
						select: {
							id: true,
							userId: true,
							user: {
								select: {
									firstName: true,
									lastName: true,
									email: true,
									phone: true,
								},
							},
						},
					},
				},
			},
		},
	});

	if (!row) {
		throw AppError.notFound('Event not found');
	}
	if (!row.isActive) {
		throw AppError.notFound('Event not found');
	}

	await assertActorCanManageAvailability(actor, row.instructorId);

	const students = row.participants.map((p) =>
		mapPersonToLessonDetailDto(p.student),
	);

	let freeWindows: { startTime: string; endTime: string }[] | undefined;
	if (opts?.includeSlots) {
		const dayAnchor = row.startTime;
		const free = await computeDayWindows(
			row.instructorId,
			new Date(
				Date.UTC(
					dayAnchor.getUTCFullYear(),
					dayAnchor.getUTCMonth(),
					dayAnchor.getUTCDate(),
				),
			),
			prisma,
			eventId,
		);
		freeWindows =
			free === null ? [] : utcDayFreeWindowsToIso(dayAnchor, free);
	}

	return {
		event: {
			id: row.id,
			type: row.type,
			status: row.status,
			courseId: row.courseId,
			startTime: row.startTime.toISOString(),
			endTime: row.endTime.toISOString(),
			capacity: row.capacity,
			createdAt: row.createdAt.toISOString(),
			instructor: mapPersonToLessonDetailDto(row.instructor),
			students,
			...(freeWindows !== undefined ? { freeWindows } : {}),
		},
	};
}
