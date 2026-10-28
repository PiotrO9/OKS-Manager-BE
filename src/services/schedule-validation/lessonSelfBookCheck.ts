import { Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { ScheduleDomainError } from '../../lib/http/ScheduleDomainError';
import {
	instantToPolishDateTime,
	parsePolishScheduleWindow,
} from '../../lib/polishScheduleTime';
import type { ScheduleAvailabilityCheckBody } from '../../schemas/schedule.schemas';
import { resolveScheduleDurationPolicy } from './policy';
import { assertStudentSelfBookingDurationAllowed } from './policy';
import { getCoursePracticePackageBalance } from '../../lib/lesson-scheduling';
import {
	assertCourseCanBeSelfBooked,
	assertStudentParticipatesInCourse,
	loadCourseForBooking,
	loadStudentProfileIdForUser,
} from '../lesson/bookingAccess';
import { assertLessonSchedulingWindowAvailable } from '../lesson/scheduleConflicts';
import { findAvailableVehicleIdForStudentBooking } from '../lesson/vehicleAvailability';
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

export async function checkLessonSelfBookAvailability(
	actor: { id: string; role: Role },
	body: Extract<
		ScheduleAvailabilityCheckBody,
		{ intent: 'lesson_self_book' }
	>,
) {
	if (actor.role !== Role.STUDENT) {
		throw AppError.forbidden('Forbidden');
	}

	const course = await loadCourseForBooking(body.courseId);
	const { start, end, durationMinutes } = parsePolishScheduleWindow(body);
	const policy = await resolveScheduleDurationPolicy(
		prisma,
		course.schoolId,
		'PRACTICE',
	);
	const issues: ScheduleAvailabilityIssue[] = [];
	let remainingMinutes: number | undefined;
	let alternative:
		| { startTime: string; endTime: string; durationMinutes: number }
		| undefined;

	try {
		assertCourseCanBeSelfBooked(course);
	} catch (error) {
		expectedClientError(error);
		issues.push({ code: 'COURSE_NOT_ELIGIBLE', field: 'courseId' });
		return { available: false, issues, policy };
	}

	if (!body.bookingMode) {
		pushDurationIssue(issues, durationMinutes, policy);
	}
	await pushLessonDateIssue(issues, start, course.schoolId);

	const studentProfileId = await loadStudentProfileIdForUser(actor.id);
	let studentEligible = true;
	try {
		await assertStudentParticipatesInCourse(course.id, studentProfileId, {
			requireActive: true,
		});
	} catch (error) {
		expectedClientError(error);
		studentEligible = false;
		issues.push({ code: 'STUDENT_NOT_ELIGIBLE', field: 'studentId' });
	}

	const instructorEligible = await pushLessonInstructorIssue(
		issues,
		body.instructorId,
		course,
	);

	await prisma.$transaction(async (tx) => {
		if (studentEligible && instructorEligible) {
			remainingMinutes = (
				await getCoursePracticePackageBalance(
					tx,
					course.id,
					studentProfileId,
					course.totalHours,
				)
			).remainingMinutes;
			if (body.bookingMode) {
				try {
					await assertStudentSelfBookingDurationAllowed(tx, {
						schoolId: course.schoolId,
						courseId: course.id,
						studentProfileId,
						totalHours: course.totalHours,
						start,
						end,
						bookingMode: body.bookingMode,
					});
				} catch (error) {
					expectedClientError(error);
					issues.push({
						code:
							error instanceof ScheduleDomainError &&
							error.reason === 'COURSE_LIMIT_EXCEEDED'
								? 'COURSE_LIMIT_EXCEEDED'
								: 'DURATION_TOO_SHORT',
						field:
							error instanceof ScheduleDomainError &&
							error.reason === 'COURSE_LIMIT_EXCEEDED'
								? 'courseId'
								: 'endTime',
					});
				}
			}
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
			if (
				!body.bookingMode &&
				!issues.some((issue) => issue.code === 'DATE_NOT_BOOKABLE') &&
				remainingMinutes > 0 &&
				remainingMinutes < durationMinutes &&
				remainingMinutes < policy.minDurationMinutes
			) {
				const shortEnd = new Date(
					start.getTime() + remainingMinutes * 60_000,
				);
				try {
					await assertStudentSelfBookingDurationAllowed(tx, {
						schoolId: course.schoolId,
						courseId: course.id,
						studentProfileId,
						totalHours: course.totalHours,
						start,
						end: shortEnd,
						bookingMode: 'REMAINING_PACKAGE',
					});
					await assertLessonSchedulingWindowAvailable(tx, {
						instructorId: body.instructorId,
						studentProfileId,
						courseId: course.id,
						courseKind: course.kind,
						totalHours: course.totalHours,
						start,
						end: shortEnd,
					});
					await findAvailableVehicleIdForStudentBooking(
						tx,
						body.instructorId,
						course.schoolId,
						start,
						shortEnd,
						course.courseTypeId,
					);
					const shortEndTime = instantToPolishDateTime(shortEnd).time;
					alternative = {
						startTime: body.startTime,
						endTime: shortEndTime,
						durationMinutes: remainingMinutes,
					};
				} catch (error) {
					expectedClientError(error);
				}
			}
		}

		try {
			await findAvailableVehicleIdForStudentBooking(
				tx,
				body.instructorId,
				course.schoolId,
				start,
				end,
				course.courseTypeId,
			);
		} catch (error) {
			scheduleIssueCode(error, ['NO_VEHICLE_AVAILABLE']);
			issues.push({
				code: 'NO_VEHICLE_AVAILABLE',
				field: 'vehicleId',
			});
		}
	});

	return {
		available: issues.length === 0,
		issues,
		policy,
		remainingMinutes,
		alternative,
	};
}
