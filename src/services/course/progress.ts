import { CourseKind } from '@prisma/client';
import type { LessonTimeRange } from './types';

function clampProgress(value: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}

	return Math.max(0, Math.min(100, value));
}

function lessonDurationMinutes(
	row: Pick<LessonTimeRange, 'startTime' | 'endTime'>,
): number {
	return Math.round(
		(row.endTime.getTime() - row.startTime.getTime()) / 60_000,
	);
}

export function calculateCourseProgress(
	kind: CourseKind,
	totalHours: number,
	completedMinutes: number,
): number {
	if (kind !== CourseKind.PRACTICAL && kind !== CourseKind.EXTRA) {
		return 0;
	}

	const requiredMinutes = totalHours * 60;
	if (requiredMinutes <= 0 || completedMinutes <= 0) {
		return 0;
	}

	return clampProgress(Math.round((completedMinutes / requiredMinutes) * 100));
}

export function groupCompletedMinutesByCourse(
	rows: LessonTimeRange[],
): Map<string, number> {
	const minutesByCourse = new Map<string, number>();

	for (const row of rows) {
		const minutes = lessonDurationMinutes(row);
		if (minutes <= 0) {
			continue;
		}

		minutesByCourse.set(
			row.courseId,
			(minutesByCourse.get(row.courseId) ?? 0) + minutes,
		);
	}

	return minutesByCourse;
}
