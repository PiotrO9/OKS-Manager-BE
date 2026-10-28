import { AppError } from '../../lib/http/AppError';
import {
	ScheduleDomainError,
	type ScheduleDomainReason,
} from '../../lib/http/ScheduleDomainError';
import {
	assertInstructorCanBookCourse,
	type CourseForBooking,
} from '../lesson/bookingAccess';
import { assertLessonTimeIsBookable } from '../lesson/bookingRules';
import type {
	ScheduleAvailabilityIssueCode,
	ScheduleAvailabilityIssue,
} from './checkTypes';

export function expectedClientError(error: unknown): AppError {
	if (
		error instanceof AppError &&
		error.statusCode >= 400 &&
		error.statusCode < 500
	) {
		return error;
	}
	throw error;
}

export function expectedScheduleReason(
	error: unknown,
	reasons: readonly ScheduleDomainReason[],
): ScheduleDomainError {
	if (
		error instanceof ScheduleDomainError &&
		reasons.includes(error.reason)
	) {
		return error;
	}
	throw error;
}

export function scheduleIssueCode(
	error: unknown,
	reasons: readonly Extract<
		ScheduleAvailabilityIssueCode,
		ScheduleDomainReason
	>[],
): Extract<ScheduleAvailabilityIssueCode, ScheduleDomainReason> {
	return expectedScheduleReason(error, reasons).reason as Extract<
		ScheduleAvailabilityIssueCode,
		ScheduleDomainReason
	>;
}

export function lessonScheduleIssue(error: unknown): ScheduleAvailabilityIssue {
	const code = scheduleIssueCode(error, [
		'STUDENT_BUSY',
		'COURSE_LIMIT_EXCEEDED',
		'INSTRUCTOR_BUSY',
		'OUTSIDE_INSTRUCTOR_HOURS',
	]);
	return {
		code,
		field:
			code === 'STUDENT_BUSY'
				? 'studentId'
				: code === 'COURSE_LIMIT_EXCEEDED'
					? 'courseId'
					: 'instructorId',
	};
}

export function pushDurationIssue(
	issues: ScheduleAvailabilityIssue[],
	durationMinutes: number,
	policy: { minDurationMinutes: number; maxDurationMinutes: number },
): void {
	if (durationMinutes < policy.minDurationMinutes) {
		issues.push({ code: 'DURATION_TOO_SHORT', field: 'endTime' });
	} else if (durationMinutes > policy.maxDurationMinutes) {
		issues.push({ code: 'DURATION_TOO_LONG', field: 'endTime' });
	}
}

export async function pushLessonDateIssue(
	issues: ScheduleAvailabilityIssue[],
	start: Date,
	schoolId: string,
): Promise<void> {
	try {
		await assertLessonTimeIsBookable(start, schoolId);
	} catch (error) {
		expectedScheduleReason(error, ['DATE_NOT_BOOKABLE', 'SCHOOL_CLOSED']);
		issues.push({ code: 'DATE_NOT_BOOKABLE', field: 'date' });
	}
}

export async function pushLessonInstructorIssue(
	issues: ScheduleAvailabilityIssue[],
	instructorId: string,
	course: CourseForBooking,
	options?: { allowSubstitute?: boolean },
): Promise<boolean> {
	try {
		await assertInstructorCanBookCourse(instructorId, course, options);
		return true;
	} catch (error) {
		expectedClientError(error);
		issues.push({
			code: 'INSTRUCTOR_NOT_ELIGIBLE',
			field: 'instructorId',
		});
		return false;
	}
}

export async function pushLessonScheduleIssue(
	issues: ScheduleAvailabilityIssue[],
	check: () => Promise<void>,
): Promise<void> {
	try {
		await check();
	} catch (error) {
		issues.push(lessonScheduleIssue(error));
	}
}
