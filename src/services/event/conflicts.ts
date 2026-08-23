import { LessonStatus, Prisma } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';

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

export async function assertNewParticipantNoScheduleConflicts(
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
