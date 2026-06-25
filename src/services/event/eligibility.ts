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

import { findStudentProfileIdsWithScheduleConflictsForEventWindow } from './conflicts';
import type {
	ListTheoryEventEligibleStudentsResult,
	TheoryEventEligibleStudentRowDto,
} from './mappers';

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
