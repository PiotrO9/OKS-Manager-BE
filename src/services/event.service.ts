import {
	CourseParticipantStatus,
	EventType,
	LessonStatus,
	Prisma,
	Role,
} from '@prisma/client';
import { AppError } from '../lib/http/AppError';
import { validateVehicleForInstructor } from '../lib/vehicle.helpers';
import { getPrisma } from '../lib/prisma';
import type {
	AssignStudentsBody,
	CreateInstructorEventBody,
	PatchInstructorEventBody,
	ReplaceEventStudentsBody,
} from '../schemas/event.schemas';
import {
	mapPersonToLessonDetailDto,
	type LessonPersonDetailDto,
} from './lesson.service';
import {
	assertActorCanManageAvailability,
	assertInstructorTimeWindowAvailable,
	computeDayWindows,
	resolveActiveInstructorProfile,
} from './instructor-availability.service';

const prisma = getPrisma();

/** Konwersja wolnych okien (minuty od północy UTC) na ISO dla dnia eventu. */
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

function assertEventTypeAllowsParticipants(eventType: EventType): void {
	if (eventType !== EventType.THEORY) {
		throw AppError.unprocessableEntity(
			'Student participants are only supported for THEORY events',
		);
	}
}

/** Szkoły OSK powiązane z instruktorem; dla MANAGERA tylko własne OSK. */
async function getSchoolIdsForEventParticipantValidation(
	actor: { id: string; role: Role },
	instructorId: string,
): Promise<string[]> {
	if (actor.role !== Role.MANAGER && actor.role !== Role.ADMIN) {
		throw AppError.forbidden('Forbidden');
	}
	const links = await prisma.instructorSchool.findMany({
		where: {
			instructorId,
			school:
				actor.role === Role.MANAGER
					? { ownerId: actor.id, deletedAt: null }
					: { deletedAt: null },
		},
		select: { schoolId: true },
	});
	return links.map((l) => l.schoolId);
}

async function assertStudentProfilesInAllowedSchools(
	db: Prisma.TransactionClient | ReturnType<typeof getPrisma>,
	profileIds: string[],
	allowedSchoolIds: string[],
): Promise<void> {
	if (profileIds.length === 0) {
		return;
	}
	if (allowedSchoolIds.length === 0) {
		throw AppError.unprocessableEntity(
			'No driving school context available for participant validation',
		);
	}
	const rows = await db.studentSchool.findMany({
		where: {
			studentId: { in: profileIds },
			schoolId: { in: allowedSchoolIds },
		},
		select: { studentId: true },
	});
	const covered = new Set(rows.map((r) => r.studentId));
	for (const pid of profileIds) {
		if (!covered.has(pid)) {
			throw AppError.unprocessableEntity(
				'One or more students are not enrolled in a driving school linked to this event',
			);
		}
	}
}

async function loadActiveStudentUserIdToProfileIdMap(
	uniqueUserIds: string[],
): Promise<Map<string, string>> {
	if (uniqueUserIds.length === 0) {
		return new Map();
	}
	const users = await prisma.user.findMany({
		where: { id: { in: uniqueUserIds } },
		select: {
			id: true,
			role: true,
			deletedAt: true,
			studentProfile: { select: { id: true } },
		},
	});

	if (users.length !== uniqueUserIds.length) {
		throw AppError.notFound('One or more students not found');
	}

	const map = new Map<string, string>();
	for (const u of users) {
		if (
			u.deletedAt !== null ||
			u.role !== Role.STUDENT ||
			!u.studentProfile
		) {
			throw AppError.notFound('One or more students not found');
		}
		map.set(u.id, u.studentProfile.id);
	}
	return map;
}

/**
 * Zbiorczo: profile kursantów z `candidateProfileIds`, którzy mają kolizję z oknem
 * `[start, end)` — lekcja (nie CANCELLED) lub udział w **innym** aktywnym evencie
 * (wyłączenie `eventId`). Używane przez POST/PUT uczestników oraz GET eligible-students.
 */
export async function findStudentProfileIdsWithScheduleConflictsForEventWindow(
	tx: Prisma.TransactionClient | ReturnType<typeof getPrisma>,
	params: {
		eventId: string;
		start: Date;
		end: Date;
		candidateProfileIds: string[];
	},
): Promise<Set<string>> {
	const { eventId, start, end, candidateProfileIds } = params;
	if (candidateProfileIds.length === 0) {
		return new Set();
	}

	const [lessonRows, eventRows] = await Promise.all([
		tx.lesson.findMany({
			where: {
				studentId: { in: candidateProfileIds },
				status: { not: LessonStatus.CANCELLED },
				startTime: { lt: end },
				endTime: { gt: start },
			},
			select: { studentId: true },
		}),
		tx.eventParticipant.findMany({
			where: {
				studentId: { in: candidateProfileIds },
				eventId: { not: eventId },
				event: {
					isActive: true,
					startTime: { lt: end },
					endTime: { gt: start },
				},
			},
			select: { studentId: true },
		}),
	]);

	const result = new Set<string>();
	for (const r of lessonRows) {
		result.add(r.studentId);
	}
	for (const r of eventRows) {
		result.add(r.studentId);
	}
	return result;
}

async function assertNewParticipantNoScheduleConflicts(
	tx: Prisma.TransactionClient,
	eventId: string,
	studentProfileId: string,
	start: Date,
	end: Date,
): Promise<void> {
	const conflicting =
		await findStudentProfileIdsWithScheduleConflictsForEventWindow(tx, {
			eventId,
			start,
			end,
			candidateProfileIds: [studentProfileId],
		});
	if (!conflicting.has(studentProfileId)) {
		return;
	}

	const lessonConflict = await tx.lesson.findFirst({
		where: {
			studentId: studentProfileId,
			status: { not: LessonStatus.CANCELLED },
			startTime: { lt: end },
			endTime: { gt: start },
		},
		select: { id: true },
	});
	if (lessonConflict) {
		throw AppError.conflict('Student has a conflicting driving lesson');
	}
	throw AppError.conflict('Student has a conflicting scheduled event');
}

async function assertCourseEligibleForInstructorEvent(
	instructorId: string,
	courseId: string,
): Promise<void> {
	const course = await prisma.course.findFirst({
		where: { id: courseId, deletedAt: null },
		select: { id: true, schoolId: true },
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
}

export type InstructorEventDto = {
	id: string;
	instructorId: string;
	type: EventType;
	courseId: string | null;
	startTime: string;
	endTime: string;
	vehicleId: string | null;
	capacity: number | null;
	createdAt: string;
};

/** GET `/events/:id` — bez płaskich `instructorId` / `vehicleId`; pełny **`instructor`** jak przy GET `/lessons/:id`; **`students`** — uczestnicy z `event_participants`, ten sam kształt co osoba przy GET `/lessons/:id`, kolejność wg `created_at` (THEORY: wiele, DRIVE: zwykle 0–1). Opcjonalnie **`freeWindows`** gdy `?includeSlots=true`. */
export type InstructorEventWithDetailsDto = Omit<
	InstructorEventDto,
	'instructorId' | 'vehicleId'
> & {
	instructor: LessonPersonDetailDto;
	students: LessonPersonDetailDto[];
	freeWindows?: { startTime: string; endTime: string }[];
};

export type AssignStudentsToEventResult = {
	assigned: number;
	skipped: number;
};

export type ReplaceEventStudentsResult = { studentUserIds: string[] };

export type TheoryEventEligibleCapacityDto = {
	limit: number | null;
	used: number;
	remaining: number | null;
};

export type TheoryEventEligibleStudentRowDto = {
	id: string;
	userId: string;
	firstName: string;
	lastName: string;
	email: string;
	phone: string | null;
	pkkNumber: string | null;
	isActive: boolean;
	createdAt: string;
	isAssignedToEvent: boolean;
	hasScheduleConflict: boolean;
	canAssign: boolean;
};

export type ListTheoryEventEligibleStudentsResult = {
	courseId: string;
	capacity: TheoryEventEligibleCapacityDto;
	students: TheoryEventEligibleStudentRowDto[];
};

/**
 * GET `/events/:id/eligible-students` — kursanci z kursu powiązanego z eventem THEORY
 * (`course_participants` ACTIVE), z flagami kolizji grafiku i capacity (jak przy POST/PUT uczestników).
 */
export async function listTheoryEventEligibleStudents(
	actor: { id: string; role: Role },
	eventId: string,
	opts?: { overrideStart?: Date; overrideEnd?: Date },
): Promise<ListTheoryEventEligibleStudentsResult> {
	const row = await prisma.instructorEvent.findUnique({
		where: { id: eventId },
		select: {
			id: true,
			instructorId: true,
			isActive: true,
			type: true,
			courseId: true,
			startTime: true,
			endTime: true,
			capacity: true,
		},
	});

	if (!row) {
		throw AppError.notFound('Event not found');
	}
	if (!row.isActive) {
		throw AppError.notFound('Event not found');
	}
	if (row.type !== EventType.THEORY) {
		throw AppError.unprocessableEntity('Event is not a THEORY event');
	}
	if (row.courseId === null) {
		throw AppError.unprocessableEntity('THEORY event has no linked course');
	}

	await assertActorCanManageAvailability(actor, row.instructorId);

	const courseId = row.courseId;
	const start = opts?.overrideStart ?? row.startTime;
	const end = opts?.overrideEnd ?? row.endTime;

	const [participants, courseParticipants] = await Promise.all([
		prisma.eventParticipant.findMany({
			where: { eventId: row.id },
			select: { studentId: true },
		}),
		prisma.courseParticipant.findMany({
			where: {
				courseId,
				status: CourseParticipantStatus.ACTIVE,
			},
			select: {
				student: {
					select: {
						id: true,
						userId: true,
						pkkNumber: true,
						createdAt: true,
						user: {
							select: {
								firstName: true,
								lastName: true,
								email: true,
								phone: true,
								isActive: true,
							},
						},
					},
				},
			},
			orderBy: [
				{ student: { user: { lastName: 'asc' } } },
				{ student: { user: { firstName: 'asc' } } },
			],
		}),
	]);

	const assignedSet = new Set(participants.map((p) => p.studentId));
	const used = participants.length;
	const limit = row.capacity;
	const remaining = limit === null ? null : Math.max(0, limit - used);

	const profileIds = courseParticipants.map((cp) => cp.student.id);

	const conflictingIds =
		profileIds.length === 0
			? new Set<string>()
			: await findStudentProfileIdsWithScheduleConflictsForEventWindow(
					prisma,
					{
						eventId: row.id,
						start,
						end,
						candidateProfileIds: profileIds,
					},
				);

	const students: TheoryEventEligibleStudentRowDto[] = courseParticipants.map(
		(cp) => {
			const s = cp.student;
			const isAssignedToEvent = assignedSet.has(s.id);
			const hasScheduleConflict = conflictingIds.has(s.id);
			const canAssign =
				!isAssignedToEvent &&
				!hasScheduleConflict &&
				(remaining === null || remaining > 0);

			return {
				id: s.id,
				userId: s.userId,
				firstName: s.user.firstName,
				lastName: s.user.lastName,
				email: s.user.email,
				phone: s.user.phone,
				pkkNumber: s.pkkNumber,
				isActive: s.user.isActive,
				createdAt: s.createdAt.toISOString(),
				isAssignedToEvent,
				hasScheduleConflict,
				canAssign,
			};
		},
	);

	return {
		courseId,
		capacity: {
			limit,
			used,
			remaining,
		},
		students,
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
			courseId: row.courseId,
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

/** GET `/events/:id/students` — UUID użytkowników (`users.id`) przypisanych do eventu. */
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
				courseId: true,
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

/**
 * POST `/events/:id/students` — dopisuje kursantów do eventu **THEORY** (semantyka
 * „dokładka”): istniejący uczestnicy zostają; kursanci już z listy → `skipped`.
 * Pełna zamiana zbioru: {@link replaceEventStudents}.
 */
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
			isActive: true,
			type: true,
			startTime: true,
			endTime: true,
			capacity: true,
		},
	});

	if (!event) {
		throw AppError.notFound('Event not found');
	}
	if (!event.isActive) {
		throw AppError.notFound('Event not found');
	}

	await assertActorCanManageAvailability(actor, event.instructorId);
	assertEventTypeAllowsParticipants(event.type);

	const userIdToProfileId =
		await loadActiveStudentUserIdToProfileIdMap(uniqueIds);
	const profileIdsOrdered = uniqueIds.map((uid) => {
		const pid = userIdToProfileId.get(uid);
		if (!pid) {
			throw AppError.notFound('One or more students not found');
		}
		return pid;
	});

	const allowedSchoolIds = await getSchoolIdsForEventParticipantValidation(
		actor,
		event.instructorId,
	);
	if (allowedSchoolIds.length === 0) {
		throw AppError.unprocessableEntity(
			'Instructor is not linked to a driving school for this operation',
		);
	}
	await assertStudentProfilesInAllowedSchools(
		prisma,
		profileIdsOrdered,
		allowedSchoolIds,
	);

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
			await assertNewParticipantNoScheduleConflicts(
				tx,
				eventId,
				studentId,
				start,
				end,
			);
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

/**
 * PUT `/events/:id/students` — **nadpisanie** zbioru uczestników stanem z `body.studentIds`
 * (`users.id`). Kursanci obecni w bazie, a **pominięci** w żądaniu, są usuwani
 * z `event_participants`; pusta tablica czyści listę. Idempotentne przy tej samej
 * liście. Zwraca `studentUserIds` posortowane (inna kolejność niż GET, ta sama zawartość).
 *
 * Wymaga: event **THEORY**, kursanci w uprawnionej OSK, `capacity`, brak kolizji czasowych.
 */
export async function replaceEventStudents(
	actor: { id: string; role: Role },
	eventId: string,
	body: ReplaceEventStudentsBody,
): Promise<ReplaceEventStudentsResult> {
	const uniqueIds = [...new Set(body.studentIds)];
	if (uniqueIds.length !== body.studentIds.length) {
		throw AppError.badRequest('Duplicate studentIds in request');
	}

	const event = await prisma.instructorEvent.findUnique({
		where: { id: eventId },
		select: {
			id: true,
			instructorId: true,
			isActive: true,
			type: true,
			startTime: true,
			endTime: true,
			capacity: true,
		},
	});

	if (!event) {
		throw AppError.notFound('Event not found');
	}
	if (!event.isActive) {
		throw AppError.notFound('Event not found');
	}

	await assertActorCanManageAvailability(actor, event.instructorId);
	assertEventTypeAllowsParticipants(event.type);

	if (event.capacity != null && uniqueIds.length > event.capacity) {
		throw AppError.conflict('Event capacity would be exceeded');
	}

	const userIdToProfileId =
		await loadActiveStudentUserIdToProfileIdMap(uniqueIds);
	const targetProfileIds = uniqueIds.map((uid) => {
		const pid = userIdToProfileId.get(uid);
		if (!pid) {
			throw AppError.notFound('One or more students not found');
		}
		return pid;
	});

	if (uniqueIds.length > 0) {
		const allowedSchoolIds =
			await getSchoolIdsForEventParticipantValidation(
				actor,
				event.instructorId,
			);
		if (allowedSchoolIds.length === 0) {
			throw AppError.unprocessableEntity(
				'Instructor is not linked to a driving school for this operation',
			);
		}
		await assertStudentProfilesInAllowedSchools(
			prisma,
			targetProfileIds,
			allowedSchoolIds,
		);
	}

	const start = event.startTime;
	const end = event.endTime;

	await prisma.$transaction(async (tx) => {
		const existing = await tx.eventParticipant.findMany({
			where: { eventId },
			select: { studentId: true },
		});
		const existingSet = new Set(existing.map((e) => e.studentId));
		const targetSet = new Set(targetProfileIds);

		const toRemove = [...existingSet].filter((id) => !targetSet.has(id));
		const toAdd = targetProfileIds.filter((id) => !existingSet.has(id));

		if (toRemove.length > 0) {
			await tx.eventParticipant.deleteMany({
				where: {
					eventId,
					studentId: { in: toRemove },
				},
			});
		}

		for (const studentId of toAdd) {
			await assertNewParticipantNoScheduleConflicts(
				tx,
				eventId,
				studentId,
				start,
				end,
			);
		}

		if (toAdd.length > 0) {
			await tx.eventParticipant.createMany({
				data: toAdd.map((studentId) => ({
					eventId,
					studentId,
				})),
			});
		}
	});

	return {
		studentUserIds: [...uniqueIds].sort(),
	};
}

/**
 * DELETE `/events/:id/students/:studentUserId` — usuwa **jedno** powiązanie
 * kursant ↔ event. Parametr `studentUserId` to **`users.id`** (jak elementy
 * `studentIds` / `studentUserIds`). Zwraca pozostałych uczestników (`studentUserIds`
 * posortowane). Gdy trzeba ustawić całą listę od zera, użyj {@link replaceEventStudents}.
 */
export async function removeStudentFromEvent(
	actor: { id: string; role: Role },
	eventId: string,
	studentUserId: string,
): Promise<ReplaceEventStudentsResult> {
	const event = await prisma.instructorEvent.findUnique({
		where: { id: eventId },
		select: {
			id: true,
			instructorId: true,
			isActive: true,
			type: true,
		},
	});

	if (!event) {
		throw AppError.notFound('Event not found');
	}
	if (!event.isActive) {
		throw AppError.notFound('Event not found');
	}

	await assertActorCanManageAvailability(actor, event.instructorId);
	assertEventTypeAllowsParticipants(event.type);

	const userIdToProfileId = await loadActiveStudentUserIdToProfileIdMap([
		studentUserId,
	]);
	const profileId = userIdToProfileId.get(studentUserId)!;

	const deleted = await prisma.eventParticipant.deleteMany({
		where: {
			eventId,
			studentId: profileId,
		},
	});

	if (deleted.count === 0) {
		throw AppError.notFound('Student is not assigned to this event');
	}

	const { studentUserIds } = await getEventStudentUserIds(actor, eventId);
	return { studentUserIds: [...studentUserIds].sort() };
}
