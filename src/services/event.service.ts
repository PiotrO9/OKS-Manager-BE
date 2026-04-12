import { EventType, LessonStatus, Role } from '@prisma/client';
import { AppError } from '../lib/http/AppError';
import { validateVehicleForInstructor } from '../lib/vehicle.helpers';
import { getPrisma } from '../lib/prisma';
import type {
	AssignStudentsBody,
	CreateInstructorEventBody,
	PatchInstructorEventBody,
} from '../schemas/event.schemas';
import {
	assertActorCanManageAvailability,
	assertInstructorTimeWindowAvailable,
	resolveActiveInstructorProfile,
} from './instructor-availability.service';

const prisma = getPrisma();

export type InstructorEventDto = {
	id: string;
	instructorId: string;
	type: EventType;
	startTime: string;
	endTime: string;
	vehicleId: string | null;
	capacity: number | null;
	createdAt: string;
};

export type AssignStudentsToEventResult = {
	assigned: number;
	skipped: number;
};

export async function createInstructorEvent(
	actor: { id: string; role: Role },
	body: CreateInstructorEventBody,
): Promise<{ event: InstructorEventDto }> {
	const { instructorId, type, startTime, endTime, vehicleId, capacity } =
		body;

	await assertActorCanManageAvailability(actor, instructorId);
	await resolveActiveInstructorProfile(instructorId);

	const start = new Date(startTime);
	const end = new Date(endTime);

	if (type === EventType.DRIVE) {
		if (!vehicleId) {
			throw AppError.badRequest('vehicleId is required for DRIVE events');
		}
		await validateVehicleForInstructor(instructorId, vehicleId, prisma);
	}

	const resolvedVehicleId = type === EventType.DRIVE ? vehicleId! : null;

	const row = await prisma.$transaction(async (tx) => {
		await assertInstructorTimeWindowAvailable(instructorId, start, end, tx);

		const lessonConflict = await tx.lesson.findFirst({
			where: {
				instructorId,
				status: { not: LessonStatus.CANCELLED },
				startTime: { lt: end },
				endTime: { gt: start },
			},
			select: { id: true },
		});
		if (lessonConflict) {
			throw AppError.conflict('Time slot conflicts with a lesson');
		}

		const eventConflict = await tx.instructorEvent.findFirst({
			where: {
				instructorId,
				startTime: { lt: end },
				endTime: { gt: start },
			},
			select: { id: true },
		});
		if (eventConflict) {
			throw AppError.conflict(
				'Time slot conflicts with a scheduled block',
			);
		}

		if (type === EventType.DRIVE && resolvedVehicleId) {
			const vehicleLessonConflict = await tx.lesson.findFirst({
				where: {
					vehicleId: resolvedVehicleId,
					status: { not: LessonStatus.CANCELLED },
					startTime: { lt: end },
					endTime: { gt: start },
				},
				select: { id: true },
			});
			if (vehicleLessonConflict) {
				throw AppError.conflict('Vehicle is already in use');
			}

			const vehicleEventConflict = await tx.instructorEvent.findFirst({
				where: {
					vehicleId: resolvedVehicleId,
					type: EventType.DRIVE,
					startTime: { lt: end },
					endTime: { gt: start },
				},
				select: { id: true },
			});
			if (vehicleEventConflict) {
				throw AppError.conflict('Vehicle is already in use');
			}
		}

		return tx.instructorEvent.create({
			data: {
				instructorId,
				type,
				startTime: start,
				endTime: end,
				vehicleId: resolvedVehicleId,
				capacity: capacity ?? null,
			},
			select: {
				id: true,
				instructorId: true,
				type: true,
				startTime: true,
				endTime: true,
				vehicleId: true,
				capacity: true,
				createdAt: true,
			},
		});
	});

	return {
		event: {
			id: row.id,
			instructorId: row.instructorId,
			type: row.type,
			startTime: row.startTime.toISOString(),
			endTime: row.endTime.toISOString(),
			vehicleId: row.vehicleId,
			capacity: row.capacity,
			createdAt: row.createdAt.toISOString(),
		},
	};
}

export async function getInstructorEventById(
	actor: { id: string; role: Role },
	eventId: string,
): Promise<{ event: InstructorEventDto }> {
	const row = await prisma.instructorEvent.findUnique({
		where: { id: eventId },
		select: {
			id: true,
			instructorId: true,
			type: true,
			startTime: true,
			endTime: true,
			vehicleId: true,
			capacity: true,
			createdAt: true,
		},
	});

	if (!row) {
		throw AppError.notFound('Event not found');
	}

	await assertActorCanManageAvailability(actor, row.instructorId);

	return {
		event: {
			id: row.id,
			instructorId: row.instructorId,
			type: row.type,
			startTime: row.startTime.toISOString(),
			endTime: row.endTime.toISOString(),
			vehicleId: row.vehicleId,
			capacity: row.capacity,
			createdAt: row.createdAt.toISOString(),
		},
	};
}

export async function updateInstructorEvent(
	actor: { id: string; role: Role },
	eventId: string,
	body: PatchInstructorEventBody,
): Promise<{ event: InstructorEventDto }> {
	const current = await prisma.instructorEvent.findUnique({
		where: { id: eventId },
		select: {
			id: true,
			instructorId: true,
			type: true,
			startTime: true,
			endTime: true,
			vehicleId: true,
			capacity: true,
		},
	});

	if (!current) {
		throw AppError.notFound('Event not found');
	}

	await assertActorCanManageAvailability(actor, current.instructorId);

	if (
		body.instructorId !== undefined &&
		body.instructorId !== current.instructorId
	) {
		await assertActorCanManageAvailability(actor, body.instructorId);
		await resolveActiveInstructorProfile(body.instructorId);
	}

	const mergedInstructorId = body.instructorId ?? current.instructorId;
	const mergedType = body.type ?? current.type;
	const mergedStart = body.startTime
		? new Date(body.startTime)
		: current.startTime;
	const mergedEnd = body.endTime ? new Date(body.endTime) : current.endTime;
	const mergedVehicleId =
		body.vehicleId !== undefined ? body.vehicleId : current.vehicleId;
	const mergedCapacity =
		body.capacity !== undefined ? body.capacity : current.capacity;

	if (mergedStart.getTime() >= mergedEnd.getTime()) {
		throw AppError.badRequest('startTime must be before endTime');
	}

	if (mergedType === EventType.DRIVE) {
		if (!mergedVehicleId) {
			throw AppError.badRequest('vehicleId is required for DRIVE events');
		}
		await validateVehicleForInstructor(
			mergedInstructorId,
			mergedVehicleId,
			prisma,
		);
	}

	const resolvedVehicleId =
		mergedType === EventType.DRIVE ? mergedVehicleId : null;

	const timeChanged =
		body.startTime !== undefined || body.endTime !== undefined;
	const instructorChanged =
		body.instructorId !== undefined &&
		body.instructorId !== current.instructorId;
	const needsTimeValidation = timeChanged || instructorChanged;

	const row = await prisma.$transaction(async (tx) => {
		if (needsTimeValidation) {
			await assertInstructorTimeWindowAvailable(
				mergedInstructorId,
				mergedStart,
				mergedEnd,
				tx,
				eventId,
			);

			const lessonConflict = await tx.lesson.findFirst({
				where: {
					instructorId: mergedInstructorId,
					status: { not: LessonStatus.CANCELLED },
					startTime: { lt: mergedEnd },
					endTime: { gt: mergedStart },
				},
				select: { id: true },
			});
			if (lessonConflict) {
				throw AppError.conflict('Time slot conflicts with a lesson');
			}

			const eventConflict = await tx.instructorEvent.findFirst({
				where: {
					instructorId: mergedInstructorId,
					id: { not: eventId },
					startTime: { lt: mergedEnd },
					endTime: { gt: mergedStart },
				},
				select: { id: true },
			});
			if (eventConflict) {
				throw AppError.conflict(
					'Time slot conflicts with a scheduled block',
				);
			}
		}

		if (mergedType === EventType.DRIVE && resolvedVehicleId) {
			const vehicleLessonConflict = await tx.lesson.findFirst({
				where: {
					vehicleId: resolvedVehicleId,
					status: { not: LessonStatus.CANCELLED },
					startTime: { lt: mergedEnd },
					endTime: { gt: mergedStart },
				},
				select: { id: true },
			});
			if (vehicleLessonConflict) {
				throw AppError.conflict('Vehicle is already in use');
			}

			const vehicleEventConflict = await tx.instructorEvent.findFirst({
				where: {
					vehicleId: resolvedVehicleId,
					type: EventType.DRIVE,
					id: { not: eventId },
					startTime: { lt: mergedEnd },
					endTime: { gt: mergedStart },
				},
				select: { id: true },
			});
			if (vehicleEventConflict) {
				throw AppError.conflict('Vehicle is already in use');
			}
		}

		return tx.instructorEvent.update({
			where: { id: eventId },
			data: {
				instructorId: mergedInstructorId,
				type: mergedType,
				startTime: mergedStart,
				endTime: mergedEnd,
				vehicleId: resolvedVehicleId,
				capacity: mergedCapacity ?? null,
			},
			select: {
				id: true,
				instructorId: true,
				type: true,
				startTime: true,
				endTime: true,
				vehicleId: true,
				capacity: true,
				createdAt: true,
			},
		});
	});

	return {
		event: {
			id: row.id,
			instructorId: row.instructorId,
			type: row.type,
			startTime: row.startTime.toISOString(),
			endTime: row.endTime.toISOString(),
			vehicleId: row.vehicleId,
			capacity: row.capacity,
			createdAt: row.createdAt.toISOString(),
		},
	};
}

export async function assignStudentsToEvent(
	actor: { id: string; role: Role },
	eventId: string,
	body: AssignStudentsBody,
): Promise<AssignStudentsToEventResult> {
	const uniqueIds = [...new Set(body.studentIds)];
	if (uniqueIds.length !== body.studentIds.length) {
		throw AppError.badRequest('Duplicate studentIds in request');
	}

	const event = await prisma.instructorEvent.findUnique({
		where: { id: eventId },
		select: {
			id: true,
			instructorId: true,
			startTime: true,
			endTime: true,
			capacity: true,
		},
	});

	if (!event) {
		throw AppError.notFound('Event not found');
	}

	await assertActorCanManageAvailability(actor, event.instructorId);

	const users = await prisma.user.findMany({
		where: { id: { in: uniqueIds } },
		select: {
			id: true,
			role: true,
			deletedAt: true,
			studentProfile: { select: { id: true } },
		},
	});

	if (users.length !== uniqueIds.length) {
		throw AppError.notFound('One or more students not found');
	}

	const userIdToProfileId = new Map<string, string>();
	for (const u of users) {
		if (
			u.deletedAt !== null ||
			u.role !== Role.STUDENT ||
			!u.studentProfile
		) {
			throw AppError.notFound('One or more students not found');
		}
		userIdToProfileId.set(u.id, u.studentProfile.id);
	}

	const profileIdsOrdered = uniqueIds.map((uid) => {
		const pid = userIdToProfileId.get(uid);
		if (!pid) {
			throw AppError.notFound('One or more students not found');
		}
		return pid;
	});

	const start = event.startTime;
	const end = event.endTime;

	return prisma.$transaction(async (tx) => {
		const existing = await tx.eventParticipant.findMany({
			where: { eventId },
			select: { studentId: true },
		});
		const existingSet = new Set(existing.map((e) => e.studentId));

		let skipped = 0;
		const newProfileIds: string[] = [];
		for (const pid of profileIdsOrdered) {
			if (existingSet.has(pid)) {
				skipped += 1;
			} else {
				newProfileIds.push(pid);
			}
		}

		const currentCount = existing.length;
		if (
			event.capacity != null &&
			currentCount + newProfileIds.length > event.capacity
		) {
			throw AppError.conflict('Event capacity would be exceeded');
		}

		for (const studentId of newProfileIds) {
			const conflict = await tx.eventParticipant.findFirst({
				where: {
					studentId,
					eventId: { not: eventId },
					event: {
						startTime: { lt: end },
						endTime: { gt: start },
					},
				},
				select: { id: true },
			});
			if (conflict) {
				throw AppError.conflict(
					'Student has a conflicting scheduled event',
				);
			}
		}

		if (newProfileIds.length > 0) {
			await tx.eventParticipant.createMany({
				data: newProfileIds.map((studentId) => ({
					eventId,
					studentId,
				})),
			});
		}

		return { assigned: newProfileIds.length, skipped };
	});
}
