import type { Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import { runScheduleWriteTransaction } from '../schedule-validation/transaction';
import type {
	AssignStudentsBody,
	EventStudentsAvailabilityCheckBody,
	ReplaceEventStudentsBody,
} from '../../schemas/event.schemas';
import { assertNewParticipantNoScheduleConflicts } from './conflicts';
import type {
	AssignStudentsToEventResult,
	EventStudentsAvailabilityResult,
	ReplaceEventStudentsResult,
} from './mappers';
import { getEventStudentUserIds } from './participantQueries';
import {
	assertActorCanManageParticipantEvent,
	assertStudentProfilesAllowedForEvent,
	getEventStudentReplacementIssues,
	getUniqueStudentIdsOrThrow,
	loadParticipantWriteEvent,
	prepareEventStudentReplacement,
	resolveStudentProfileIdsOrThrow,
} from './participantWriteHelpers';

const prisma = getPrisma();

export { getEventStudentUserIds } from './participantQueries';
export { assertEventTypeAllowsParticipants } from './participantValidation';

export async function assignStudentsToEvent(
	actor: { id: string; role: Role },
	eventId: string,
	body: AssignStudentsBody,
): Promise<AssignStudentsToEventResult> {
	const uniqueIds = getUniqueStudentIdsOrThrow(body.studentIds);
	const event = await loadParticipantWriteEvent(eventId, {
		includeSchedule: true,
	});

	await assertActorCanManageParticipantEvent(actor, event);

	const profileIdsOrdered = await resolveStudentProfileIdsOrThrow(uniqueIds);
	await assertStudentProfilesAllowedForEvent(
		actor,
		event.instructorId,
		profileIdsOrdered,
		{ requireSchoolContext: true },
	);

	const start = event.startTime!;
	const end = event.endTime!;

	return runScheduleWriteTransaction(async (tx) => {
		const existing = await tx.eventParticipant.findMany({
			where: { eventId },
			select: { studentId: true },
		});
		const existingStudentProfileIds = new Set(
			existing.map((participant) => participant.studentId),
		);

		let skipped = 0;
		const newProfileIds: string[] = [];
		for (const studentProfileId of profileIdsOrdered) {
			if (existingStudentProfileIds.has(studentProfileId)) {
				skipped += 1;
			} else {
				newProfileIds.push(studentProfileId);
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

export async function replaceEventStudents(
	actor: { id: string; role: Role },
	eventId: string,
	body: ReplaceEventStudentsBody,
): Promise<ReplaceEventStudentsResult> {
	const prepared = await prepareEventStudentReplacement(
		actor,
		eventId,
		body.studentIds,
	);

	await runScheduleWriteTransaction(async (tx) => {
		const issues = await getEventStudentReplacementIssues(prepared, tx);
		if (issues.length > 0) {
			throw AppError.conflict(issues[0]!.message);
		}

		const existing = await tx.eventParticipant.findMany({
			where: { eventId },
			select: { studentId: true },
		});
		const existingStudentProfileIds = new Set(
			existing.map((participant) => participant.studentId),
		);
		const targetStudentProfileIds = new Set(prepared.studentProfileIds);

		const toRemove = [...existingStudentProfileIds].filter(
			(id) => !targetStudentProfileIds.has(id),
		);
		const toAdd = prepared.studentProfileIds.filter(
			(id) => !existingStudentProfileIds.has(id),
		);

		if (toRemove.length > 0) {
			await tx.eventParticipant.deleteMany({
				where: {
					eventId,
					studentId: { in: toRemove },
				},
			});
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
		studentUserIds: [...prepared.studentUserIds].sort(),
	};
}

export async function checkEventStudentsAvailability(
	actor: { id: string; role: Role },
	eventId: string,
	body: EventStudentsAvailabilityCheckBody,
): Promise<EventStudentsAvailabilityResult> {
	const window =
		body.startTime && body.endTime
			? {
					start: new Date(body.startTime),
					end: new Date(body.endTime),
				}
			: undefined;
	const prepared = await prepareEventStudentReplacement(
		actor,
		eventId,
		body.studentIds,
		window,
	);
	const issues = await getEventStudentReplacementIssues(prepared);

	return { available: issues.length === 0, issues };
}

export async function removeStudentFromEvent(
	actor: { id: string; role: Role },
	eventId: string,
	studentUserId: string,
): Promise<ReplaceEventStudentsResult> {
	const event = await loadParticipantWriteEvent(eventId);

	await assertActorCanManageParticipantEvent(actor, event);

	const [profileId] = await resolveStudentProfileIdsOrThrow([studentUserId]);

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
