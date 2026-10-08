import { EventStatus, LessonStatus, Prisma } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import type { getPrisma } from '../../lib/prisma';

export async function findStudentProfileIdsWithScheduleConflictsForEventWindow(
	transaction: Prisma.TransactionClient | ReturnType<typeof getPrisma>,
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
		transaction.lesson.findMany({
			where: {
				studentId: { in: candidateProfileIds },
				status: { not: LessonStatus.CANCELLED },
				startTime: { lt: end },
				endTime: { gt: start },
			},
			select: { studentId: true },
		}),
		transaction.eventParticipant.findMany({
			where: {
				studentId: { in: candidateProfileIds },
				eventId: { not: eventId },
				event: {
					isActive: true,
					status: { not: EventStatus.CANCELLED },
					startTime: { lt: end },
					endTime: { gt: start },
				},
			},
			select: { studentId: true },
		}),
	]);

	const conflictingProfileIds = new Set<string>();
	for (const lessonRow of lessonRows) {
		conflictingProfileIds.add(lessonRow.studentId);
	}
	for (const eventRow of eventRows) {
		conflictingProfileIds.add(eventRow.studentId);
	}
	return conflictingProfileIds;
}

export async function assertNewParticipantNoScheduleConflicts(
	transaction: Prisma.TransactionClient,
	eventId: string,
	studentProfileId: string,
	start: Date,
	end: Date,
): Promise<void> {
	const conflictingProfileIds =
		await findStudentProfileIdsWithScheduleConflictsForEventWindow(
			transaction,
			{
				eventId,
				start,
				end,
				candidateProfileIds: [studentProfileId],
			},
		);
	if (!conflictingProfileIds.has(studentProfileId)) {
		return;
	}

	const lessonConflict = await transaction.lesson.findFirst({
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
