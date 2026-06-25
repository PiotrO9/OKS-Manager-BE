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

import type {
	InstructorEventListItemDto,
	InstructorEventWithDetailsDto,
} from './mappers';

function utcDayFreeWindowsToIso(
	dayAnchor: Date,
	windows: { start: number; end: number }[],
): { startTime: string; endTime: string }[] {
	const dayUtcMidnight = new Date(
		Date.UTC(
			dayAnchor.getUTCFullYear(),
			dayAnchor.getUTCMonth(),
			dayAnchor.getUTCDate(),
		),
	);
	return windows.map((w) => ({
		startTime: new Date(
			dayUtcMidnight.getTime() + w.start * 60_000,
		).toISOString(),
		endTime: new Date(
			dayUtcMidnight.getTime() + w.end * 60_000,
		).toISOString(),
	}));
}

function buildInstructorEventDateOverlapWhere(
	dateFrom: string,
	dateTo: string,
): { startTime: { lt: Date }; endTime: { gt: Date } } {
	const rangeStart = new Date(`${dateFrom}T00:00:00.000Z`);
	const rangeEnd = new Date(`${dateTo}T23:59:59.999Z`);
	return {
		startTime: { lt: rangeEnd },
		endTime: { gt: rangeStart },
	};
}

/**
 * GET `/events` — aktywne eventy w oknie; INSTRUCTOR: tylko własne; MANAGER: OSK
 * managera; ADMIN: wszystkie. Opcjonalny `instructorId` tylko dla MANAGER/ADMIN.
 */
export async function listInstructorEvents(
	actor: { id: string; role: Role },
	query: ListEventsQuery,
): Promise<{ events: InstructorEventListItemDto[] }> {
	if (actor.role === Role.STUDENT) {
		throw AppError.forbidden('Forbidden');
	}

	const overlap = buildInstructorEventDateOverlapWhere(
		query.dateFrom,
		query.dateTo,
	);
	const statusFilter =
		query.status && query.status.length > 0
			? { status: { in: query.status } as const }
			: {};

	if (query.instructorId !== undefined && actor.role === Role.INSTRUCTOR) {
		throw AppError.unprocessableEntity(
			'instructorId filter is not available for instructor role',
		);
	}

	if (actor.role === Role.INSTRUCTOR) {
		const profile = await prisma.instructorProfile.findUnique({
			where: { userId: actor.id },
			select: { id: true },
		});
		if (!profile) {
			throw AppError.notFound('Instructor profile not found');
		}
		const rows = await prisma.instructorEvent.findMany({
			where: {
				isActive: true,
				...overlap,
				...statusFilter,
				instructorId: profile.id,
			},
			select: {
				id: true,
				type: true,
				status: true,
				instructorId: true,
				courseId: true,
				startTime: true,
				endTime: true,
				vehicleId: true,
				capacity: true,
				createdAt: true,
				_count: { select: { participants: true } },
			},
			orderBy: { startTime: 'asc' },
		});
		return {
			events: rows.map((row) => ({
				id: row.id,
				type: row.type,
				status: row.status,
				instructorId: row.instructorId,
				courseId: row.courseId,
				startTime: row.startTime.toISOString(),
				endTime: row.endTime.toISOString(),
				vehicleId: row.vehicleId,
				capacity: row.capacity,
				participantCount: row._count.participants,
				createdAt: row.createdAt.toISOString(),
			})),
		};
	}

	if (actor.role === Role.MANAGER) {
		if (query.instructorId !== undefined) {
			await assertActorCanManageAvailability(actor, query.instructorId);
		}
		const rows = await prisma.instructorEvent.findMany({
			where: {
				isActive: true,
				...overlap,
				...statusFilter,
				...(query.instructorId !== undefined
					? { instructorId: query.instructorId }
					: {}),
				instructor: {
					instructorSchools: {
						some: {
							school: { ownerId: actor.id, deletedAt: null },
						},
					},
				},
			},
			select: {
				id: true,
				type: true,
				status: true,
				instructorId: true,
				courseId: true,
				startTime: true,
				endTime: true,
				vehicleId: true,
				capacity: true,
				createdAt: true,
				_count: { select: { participants: true } },
			},
			orderBy: { startTime: 'asc' },
		});
		return {
			events: rows.map((row) => ({
				id: row.id,
				type: row.type,
				status: row.status,
				instructorId: row.instructorId,
				courseId: row.courseId,
				startTime: row.startTime.toISOString(),
				endTime: row.endTime.toISOString(),
				vehicleId: row.vehicleId,
				capacity: row.capacity,
				participantCount: row._count.participants,
				createdAt: row.createdAt.toISOString(),
			})),
		};
	}

	if (actor.role === Role.ADMIN) {
		const rows = await prisma.instructorEvent.findMany({
			where: {
				isActive: true,
				...overlap,
				...statusFilter,
				...(query.instructorId !== undefined
					? { instructorId: query.instructorId }
					: {}),
			},
			select: {
				id: true,
				type: true,
				status: true,
				instructorId: true,
				courseId: true,
				startTime: true,
				endTime: true,
				vehicleId: true,
				capacity: true,
				createdAt: true,
				_count: { select: { participants: true } },
			},
			orderBy: { startTime: 'asc' },
		});
		return {
			events: rows.map((row) => ({
				id: row.id,
				type: row.type,
				status: row.status,
				instructorId: row.instructorId,
				courseId: row.courseId,
				startTime: row.startTime.toISOString(),
				endTime: row.endTime.toISOString(),
				vehicleId: row.vehicleId,
				capacity: row.capacity,
				participantCount: row._count.participants,
				createdAt: row.createdAt.toISOString(),
			})),
		};
	}

	throw AppError.forbidden('Forbidden');
}


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
