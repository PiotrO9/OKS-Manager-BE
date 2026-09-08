import { EventType, Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import { assertActorCanManageAvailability } from '../instructor-availability.service';
import {
	assertEventTypeAllowsParticipants,
	assertStudentProfilesInAllowedSchools,
	getSchoolIdsForEventParticipantValidation,
	loadActiveStudentUserIdToProfileIdMap,
} from './participantValidation';

const prisma = getPrisma();

export type ParticipantWriteEvent = {
	id: string;
	instructorId: string;
	isActive: boolean;
	type: EventType;
	startTime?: Date;
	endTime?: Date;
	capacity?: number | null;
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
