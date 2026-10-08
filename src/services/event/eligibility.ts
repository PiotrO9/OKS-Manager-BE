import { CourseParticipantStatus, EventType, Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import { assertActorCanManageAvailability } from '../instructor-availability.service';
import { findStudentProfileIdsWithScheduleConflictsForEventWindow } from './conflicts';
import {
	type ListTheoryEventEligibleStudentsResult,
	type TheoryEventEligibleStudentRowDto,
} from './mappers';

const prisma = getPrisma();

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
								profile: { select: { avatarUrl: true } },
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

	const assignedStudentIds = new Set(
		participants.map((participant) => participant.studentId),
	);
	const used = participants.length;
	const limit = row.capacity;
	const remaining = limit === null ? null : Math.max(0, limit - used);

	const profileIds = courseParticipants.map(
		(courseParticipant) => courseParticipant.student.id,
	);

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
		(courseParticipant) => {
			const student = courseParticipant.student;
			const isAssignedToEvent = assignedStudentIds.has(student.id);
			const hasScheduleConflict = conflictingIds.has(student.id);
			const canAssign =
				!isAssignedToEvent &&
				!hasScheduleConflict &&
				(remaining === null || remaining > 0);

			return {
				id: student.id,
				userId: student.userId,
				firstName: student.user.firstName,
				lastName: student.user.lastName,
				email: student.user.email,
				phone: student.user.phone,
				avatarUrl: student.user.profile?.avatarUrl ?? null,
				pkkNumber: student.pkkNumber,
				isActive: student.user.isActive,
				createdAt: student.createdAt.toISOString(),
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
