import { EventStatus, LessonStatus } from '@prisma/client';
import { getPrisma } from '../../lib/prisma';
import {
	polishDayRange,
	subtractWindows,
	timeWindowFromDates,
	type TimeWindow,
} from '../instructor-availability/time';

const prisma = getPrisma();

export async function subtractStudentScheduleConflicts(
	studentIds: string | readonly string[],
	date: Date,
	windows: readonly TimeWindow[],
	options?: { excludeLessonId?: string; excludeEventId?: string },
): Promise<TimeWindow[]> {
	const ids = Array.isArray(studentIds) ? [...studentIds] : [studentIds];

	if (ids.length === 0 || windows.length === 0) return [...windows];

	const dayRange = polishDayRange(date);
	const studentFilter = ids.length === 1 ? ids[0] : { in: ids };
	const [lessons, participations] = await Promise.all([
		prisma.lesson.findMany({
			where: {
				studentId: studentFilter,
				status: { not: LessonStatus.CANCELLED },
				startTime: { lt: dayRange.end },
				endTime: { gt: dayRange.start },
				...(options?.excludeLessonId
					? { id: { not: options.excludeLessonId } }
					: {}),
			},
			select: { startTime: true, endTime: true },
		}),
		prisma.eventParticipant.findMany({
			where: {
				studentId: studentFilter,
				event: {
					isActive: true,
					status: { not: EventStatus.CANCELLED },
					startTime: { lt: dayRange.end },
					endTime: { gt: dayRange.start },
					...(options?.excludeEventId
						? { id: { not: options.excludeEventId } }
						: {}),
				},
			},
			select: { event: { select: { startTime: true, endTime: true } } },
		}),
	]);
	const used = [
		...lessons.map((row) => timeWindowFromDates(row, dayRange)),
		...participations.map((row) =>
			timeWindowFromDates(row.event, dayRange),
		),
	];

	return windows.flatMap((window) => subtractWindows(window, used));
}
