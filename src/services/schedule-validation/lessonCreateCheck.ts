import { Role } from '@prisma/client';
import { parsePolishScheduleWindow } from '../../lib/polishScheduleTime';
import type { ScheduleAvailabilityCheckBody } from '../../schemas/schedule.schemas';
import { resolveScheduleDurationPolicy } from './policy';
import {
	assertActorCanBookLessonForCourse,
	assertStudentParticipatesInCourse,
	loadCourseForBooking,
	loadStudentProfileIdForUser,
} from '../lesson/bookingAccess';
import { assertLessonSchedulingWindowAvailable } from '../lesson/scheduleConflicts';
import { assertVehicleAvailableForBooking } from '../lesson/vehicleAvailability';
import { scheduleCheckDatabase as prisma } from './checkDatabase';
import type { ScheduleAvailabilityIssue } from './checkTypes';
import {
	expectedClientError,
	scheduleIssueCode,
	pushDurationIssue,
	pushLessonDateIssue,
	pushLessonInstructorIssue,
	pushLessonScheduleIssue,
} from './checkIssues';

export async function checkLessonCreateAvailability(
	actor: { id: string; role: Role },
	body: Extract<ScheduleAvailabilityCheckBody, { intent: 'lesson_create' }>,
) {
	const course = await loadCourseForBooking(body.courseId);

	await assertActorCanBookLessonForCourse(actor, course.schoolId);

	const { start, end, durationMinutes } = parsePolishScheduleWindow(body);
	const policy = await resolveScheduleDurationPolicy(
		prisma,
		course.schoolId,
		'PRACTICE',
	);
	const issues: ScheduleAvailabilityIssue[] = [];

	pushDurationIssue(issues, durationMinutes, policy);
	await pushLessonDateIssue(issues, start, course.schoolId);

	let studentProfileId: string | null = null;
	try {
		studentProfileId = await loadStudentProfileIdForUser(body.studentId);
		await assertStudentParticipatesInCourse(course.id, studentProfileId);
	} catch (error) {
		expectedClientError(error);
		issues.push({ code: 'STUDENT_NOT_ELIGIBLE', field: 'studentId' });
	}

	const instructorEligible = await pushLessonInstructorIssue(
		issues,
		body.instructorId,
		course,
		{ allowSubstitute: true },
	);

	await prisma.$transaction(async (tx) => {
		if (studentProfileId && instructorEligible) {
			await pushLessonScheduleIssue(issues, () =>
				assertLessonSchedulingWindowAvailable(tx, {
					instructorId: body.instructorId,
					studentProfileId,
					courseId: course.id,
					courseKind: course.kind,
					totalHours: course.totalHours,
					start,
					end,
				}),
			);
		}

		try {
			await assertVehicleAvailableForBooking(
				tx,
				body.instructorId,
				body.vehicleId,
				course.schoolId,
				start,
				end,
				course.courseTypeId,
			);
		} catch (error) {
			issues.push({
				code: scheduleIssueCode(error, [
					'VEHICLE_COURSE_TYPE_MISMATCH',
					'VEHICLE_BUSY',
					'VEHICLE_UNAVAILABLE',
				]),
				field: 'vehicleId',
			});
		}
	});

	return { available: issues.length === 0, issues, policy };
}
