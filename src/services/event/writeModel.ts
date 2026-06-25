import {
	CourseParticipantStatus,
	EventStatus,
	EventType,
	LessonStatus,
	LessonType,
	Prisma,
	Role,
} from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { assertInstructorQualifiedForCourseType } from '../../lib/instructorCourseQualification';
import { validateVehicleForInstructor } from '../../lib/vehicle.helpers';
import { getPrisma } from '../../lib/prisma';
import type {
	AssignStudentsBody,
	BulkUpdateEventStatusBody,
	CreateInstructorEventBody,
	ListEventsQuery,
	PatchInstructorEventBody,
	ReplaceEventStudentsBody,
} from '../../schemas/event.schemas';
import {
	mapPersonToLessonDetailDto,
	type LessonPersonDetailDto,
	type LessonVehicleDetailDto,
} from '../lesson.service';
import {
	assertActorCanManageAvailability,
	assertInstructorTimeWindowAvailable,
	computeDayWindows,
	resolveActiveInstructorProfile,
} from '../instructor-availability.service';

const prisma = getPrisma();

import {
	assertNewParticipantNoScheduleConflicts,
	findStudentProfileIdsWithScheduleConflictsForEventWindow,
} from './conflicts';
import { assertEventTypeAllowsParticipants } from './participants';
import type { InstructorEventDto } from './mappers';

async function assertCourseEligibleForInstructorEvent(
	instructorId: string,
	courseId: string,
): Promise<void> {
	const course = await prisma.course.findFirst({
		where: { id: courseId, deletedAt: null },
		select: { id: true, schoolId: true, courseTypeId: true },
	});
	if (!course) {
		throw AppError.notFound('Course not found');
	}
	const link = await prisma.instructorSchool.findFirst({
		where: { instructorId, schoolId: course.schoolId },
		select: { id: true },
	});
	if (!link) {
		throw AppError.unprocessableEntity(
			'Instructor is not linked to the driving school of this course',
		);
	}
	await assertInstructorQualifiedForCourseType(
		instructorId,
		course.courseTypeId,
	);
}

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

export async function createInstructorEvent(
	actor: { id: string; role: Role },
	body: CreateInstructorEventBody,
): Promise<{ event: InstructorEventDto }> {
	const {
		instructorId,
		type,
		startTime,
		endTime,
		vehicleId,
		capacity,
		courseId,
	} = body;

	await assertActorCanManageAvailability(actor, instructorId);
	await resolveActiveInstructorProfile(instructorId);

	if (courseId) {
		await assertCourseEligibleForInstructorEvent(instructorId, courseId);
	}

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
				isActive: true,
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
					isActive: true,
					startTime: { lt: end },
					endTime: { gt: start },
				},
				select: { id: true },
			});
			if (vehicleEventConflict) {
				throw AppError.conflict('Vehicle is already in use');
			}
		}

		const created = await tx.instructorEvent.create({
			data: {
				instructorId,
				courseId: courseId ?? null,
				type,
				startTime: start,
				endTime: end,
				vehicleId: resolvedVehicleId,
				capacity: capacity ?? null,
			},
			select: {
				id: true,
				instructorId: true,
				courseId: true,
				type: true,
				status: true,
				startTime: true,
				endTime: true,
				vehicleId: true,
				capacity: true,
				createdAt: true,
			},
		});

		return created;
	});

	return {
		event: {
			id: row.id,
			instructorId: row.instructorId,
			type: row.type,
			status: row.status,
			courseId: row.courseId,
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
			isActive: true,
			courseId: true,
			type: true,
			status: true,
			startTime: true,
			endTime: true,
			vehicleId: true,
			capacity: true,
		},
	});

	if (!current) {
		throw AppError.notFound('Event not found');
	}
	if (!current.isActive) {
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
	const mergedStatus = body.status ?? current.status;
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

	if (
		current.courseId !== null &&
		mergedType === EventType.THEORY &&
		(body.instructorId !== undefined || body.type !== undefined)
	) {
		await assertCourseEligibleForInstructorEvent(
			mergedInstructorId,
			current.courseId,
		);
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
					isActive: true,
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

			const existingParticipants = await tx.eventParticipant.findMany({
				where: { eventId },
				select: { studentId: true },
			});
			if (existingParticipants.length > 0) {
				const conflicting =
					await findStudentProfileIdsWithScheduleConflictsForEventWindow(
						tx,
						{
							eventId,
							start: mergedStart,
							end: mergedEnd,
							candidateProfileIds: existingParticipants.map(
								(p) => p.studentId,
							),
						},
					);
				if (conflicting.size > 0) {
					throw AppError.conflict(
						'Time change conflicts with existing participant schedules',
					);
				}
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
					isActive: true,
					startTime: { lt: mergedEnd },
					endTime: { gt: mergedStart },
				},
				select: { id: true },
			});
			if (vehicleEventConflict) {
				throw AppError.conflict('Vehicle is already in use');
			}
		}

		if (mergedCapacity != null) {
			const participantCount = await tx.eventParticipant.count({
				where: { eventId },
			});
			if (mergedCapacity < participantCount) {
				throw AppError.conflict('Event capacity would be exceeded');
			}
		}

		return tx.instructorEvent.update({
			where: { id: eventId },
			data: {
				instructorId: mergedInstructorId,
				type: mergedType,
				status: mergedStatus,
				startTime: mergedStart,
				endTime: mergedEnd,
				vehicleId: resolvedVehicleId,
				capacity: mergedCapacity ?? null,
			},
			select: {
				id: true,
				instructorId: true,
				courseId: true,
				type: true,
				status: true,
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
			status: row.status,
			courseId: row.courseId,
			startTime: row.startTime.toISOString(),
			endTime: row.endTime.toISOString(),
			vehicleId: row.vehicleId,
			capacity: row.capacity,
			createdAt: row.createdAt.toISOString(),
		},
	};
}

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
