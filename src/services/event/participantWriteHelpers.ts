import { CourseParticipantStatus, EventType, Role } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import { assertActorCanManageAvailability } from '../instructor-availability.service';
import {
	assertEventTypeAllowsParticipants,
	assertStudentProfilesInAllowedSchools,
	getSchoolIdsForEventParticipantValidation,
	loadActiveStudentUserIdToProfileIdMap,
} from './participantValidation';
import { findStudentProfileIdsWithScheduleConflictsForEventWindow } from './conflicts';
import type { EventStudentsAvailabilityIssueDto } from './mappers';

const prisma = getPrisma();

export type ParticipantWriteEvent = {
	id: string;
	instructorId: string;
	isActive: boolean;
	type: EventType;
	startTime?: Date;
	endTime?: Date;
	capacity?: number | null;
	courseId?: string | null;
};

export function getUniqueStudentIdsOrThrow(studentIds: string[]): string[] {
	const uniqueIds = [...new Set(studentIds)];
	if (uniqueIds.length !== studentIds.length) {
		throw AppError.badRequest('Duplicate studentIds in request');
	}
	return uniqueIds;
}

export async function loadParticipantWriteEvent(
	eventId: string,
	options: { includeSchedule?: boolean } = {},
): Promise<ParticipantWriteEvent> {
	const event = await prisma.instructorEvent.findUnique({
		where: { id: eventId },
		select: {
			id: true,
			instructorId: true,
			isActive: true,
			type: true,
			...(options.includeSchedule
				? {
						startTime: true,
						endTime: true,
						capacity: true,
						courseId: true,
					}
				: {}),
		},
	});

	if (!event) {
		throw AppError.notFound('Event not found');
	}
	if (!event.isActive) {
		throw AppError.notFound('Event not found');
	}

	return event;
}

export async function assertActorCanManageParticipantEvent(
	actor: { id: string; role: Role },
	event: Pick<ParticipantWriteEvent, 'instructorId' | 'type'>,
): Promise<void> {
	await assertActorCanManageAvailability(actor, event.instructorId);
	assertEventTypeAllowsParticipants(event.type);
}

export async function resolveStudentProfileIdsOrThrow(
	studentUserIds: string[],
): Promise<string[]> {
	const userIdToProfileId =
		await loadActiveStudentUserIdToProfileIdMap(studentUserIds);

	return studentUserIds.map((uid) => {
		const pid = userIdToProfileId.get(uid);
		if (!pid) {
			throw AppError.notFound('One or more students not found');
		}
		return pid;
	});
}

export async function assertStudentProfilesAllowedForEvent(
	actor: { id: string; role: Role },
	instructorId: string,
	profileIds: string[],
	options: { requireSchoolContext?: boolean } = {},
): Promise<void> {
	if (profileIds.length === 0 && !options.requireSchoolContext) {
		return;
	}

	const allowedSchoolIds = await getSchoolIdsForEventParticipantValidation(
		actor,
		instructorId,
	);
	if (allowedSchoolIds.length === 0) {
		throw AppError.unprocessableEntity(
			'Instructor is not linked to a driving school for this operation',
		);
	}

	await assertStudentProfilesInAllowedSchools(
		prisma,
		profileIds,
		allowedSchoolIds,
	);
}

export type PreparedEventStudentReplacement = {
	event: ParticipantWriteEvent & {
		startTime: Date;
		endTime: Date;
		capacity: number | null;
		courseId: string | null;
	};
	studentUserIds: string[];
	studentProfileIds: string[];
	start: Date;
	end: Date;
};

export async function prepareEventStudentReplacement(
	actor: { id: string; role: Role },
	eventId: string,
	studentIds: string[],
	window?: { start: Date; end: Date },
): Promise<PreparedEventStudentReplacement> {
	const studentUserIds = getUniqueStudentIdsOrThrow(studentIds);
	const event = await loadParticipantWriteEvent(eventId, {
		includeSchedule: true,
	});

	await assertActorCanManageParticipantEvent(actor, event);

	const studentProfileIds =
		await resolveStudentProfileIdsOrThrow(studentUserIds);
	await assertStudentProfilesAllowedForEvent(
		actor,
		event.instructorId,
		studentProfileIds,
	);
	await assertStudentProfilesInEventCourse(
		prisma,
		studentProfileIds,
		event.courseId ?? null,
	);

	return {
		event: event as PreparedEventStudentReplacement['event'],
		studentUserIds,
		studentProfileIds,
		start: window?.start ?? event.startTime!,
		end: window?.end ?? event.endTime!,
	};
}

export async function assertStudentProfilesInEventCourse(
	db: Prisma.TransactionClient | typeof prisma,
	studentProfileIds: string[],
	courseId: string | null,
): Promise<void> {
	if (!courseId || studentProfileIds.length === 0) {
		return;
	}

	const rows = await db.courseParticipant.findMany({
		where: {
			courseId,
			studentId: { in: studentProfileIds },
			status: CourseParticipantStatus.ACTIVE,
		},
		select: { studentId: true },
	});
	const activeStudentIds = new Set(rows.map((row) => row.studentId));

	if (studentProfileIds.some((id) => !activeStudentIds.has(id))) {
		throw AppError.unprocessableEntity(
			'One or more students are not active participants of the event course',
		);
	}
}

export async function getEventStudentReplacementIssues(
	prepared: PreparedEventStudentReplacement,
	db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<EventStudentsAvailabilityIssueDto[]> {
	const issues: EventStudentsAvailabilityIssueDto[] = [];

	if (
		prepared.event.capacity !== null &&
		prepared.studentUserIds.length > prepared.event.capacity
	) {
		issues.push({
			code: 'EVENT_CAPACITY_EXCEEDED',
			message: 'Liczba kursantów przekracza limit miejsc wydarzenia.',
		});
	}

	const conflictingProfileIds =
		await findStudentProfileIdsWithScheduleConflictsForEventWindow(db, {
			eventId: prepared.event.id,
			start: prepared.start,
			end: prepared.end,
			candidateProfileIds: prepared.studentProfileIds,
		});

	if (conflictingProfileIds.size > 0) {
		const conflictingStudentUserIds = prepared.studentUserIds.filter(
			(_userId, index) =>
				conflictingProfileIds.has(prepared.studentProfileIds[index]!),
		);

		issues.push({
			code: 'STUDENT_SCHEDULE_CONFLICT',
			message:
				'Co najmniej jeden kursant ma w tym czasie inną lekcję lub wydarzenie.',
			studentUserIds: conflictingStudentUserIds,
		});
	}

	return issues;
}
