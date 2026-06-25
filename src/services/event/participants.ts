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

import { assertNewParticipantNoScheduleConflicts } from './conflicts';
import type {
	AssignStudentsToEventResult,
	ReplaceEventStudentsResult,
} from './mappers';

export function assertEventTypeAllowsParticipants(eventType: EventType): void {
	if (eventType !== EventType.THEORY) {
		throw AppError.unprocessableEntity(
			'Student participants are only supported for THEORY events',
		);
	}
}

/** Szkoły OSK powiązane z instruktorem; dla MANAGERA tylko własne OSK. */
export async function getSchoolIdsForEventParticipantValidation(
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

export async function assertStudentProfilesInAllowedSchools(
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

export async function loadActiveStudentUserIdToProfileIdMap(
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
