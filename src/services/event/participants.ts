import type { Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import type {
	AssignStudentsBody,
	ReplaceEventStudentsBody,
} from '../../schemas/event.schemas';
import { assertNewParticipantNoScheduleConflicts } from './conflicts';
import type {
	AssignStudentsToEventResult,
	ReplaceEventStudentsResult,
} from './mappers';
import { getEventStudentUserIds } from './participantQueries';
import {
	assertActorCanManageParticipantEvent,
	assertStudentProfilesAllowedForEvent,
	getUniqueStudentIdsOrThrow,
	loadParticipantWriteEvent,
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

export async function replaceEventStudents(
	actor: { id: string; role: Role },
	eventId: string,
	body: ReplaceEventStudentsBody,
): Promise<ReplaceEventStudentsResult> {
	const uniqueIds = getUniqueStudentIdsOrThrow(body.studentIds);
	const event = await loadParticipantWriteEvent(eventId, {
		includeSchedule: true,
	});

	await assertActorCanManageParticipantEvent(actor, event);

	if (event.capacity != null && uniqueIds.length > event.capacity) {
		throw AppError.conflict('Event capacity would be exceeded');
	}

	const targetProfileIds = await resolveStudentProfileIdsOrThrow(uniqueIds);
	await assertStudentProfilesAllowedForEvent(
		actor,
		event.instructorId,
		targetProfileIds,
	);

	const start = event.startTime!;
	const end = event.endTime!;

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

export async function removeStudentFromEvent(
	actor: { id: string; role: Role },
	eventId: string,
	studentUserId: string,
): Promise<ReplaceEventStudentsResult> {
	const event = await loadParticipantWriteEvent(eventId);

	await assertActorCanManageParticipantEvent(actor, event);

	const [profileId] = await resolveStudentProfileIdsOrThrow([
		studentUserId,
	]);

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
