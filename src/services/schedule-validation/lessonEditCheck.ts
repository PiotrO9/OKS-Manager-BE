import { assertVehicleSupportsCourseType } from '../../lib/vehicleCourseCategories';
import { Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { ScheduleDomainError } from '../../lib/http/ScheduleDomainError';
import { assertInstructorQualifiedForCourseType } from '../../lib/instructorCourseQualification';
import { parsePolishScheduleWindow } from '../../lib/polishScheduleTime';
import { validateVehicleForInstructor } from '../../lib/vehicle.helpers';
import type { ScheduleAvailabilityCheckBody } from '../../schemas/schedule.schemas';
import { resolveScheduleDurationPolicy } from './policy';
import { assertActorCanBookLessonForCourse } from '../lesson/bookingAccess';
import { assertLessonTimeIsBookable } from '../lesson/bookingRules';
import {
	assertLessonHasNotStarted,
	assertLessonIsEditable,
} from '../lesson/editability';
import { assertLessonSchedulingWindowAvailable } from '../lesson/scheduleConflicts';
import { vehicleHasBookingConflict } from '../lesson/vehicleAvailability';
import { scheduleCheckDatabase as prisma } from './checkDatabase';
import type { ScheduleAvailabilityIssue } from './checkTypes';
import {
	expectedClientError,
	expectedScheduleReason,
	scheduleIssueCode,
	lessonScheduleIssue,
	pushDurationIssue,
} from './checkIssues';

export async function checkLessonEditAvailability(
	actor: { id: string; role: Role },
	body: Extract<ScheduleAvailabilityCheckBody, { intent: 'lesson_edit' }>,
): Promise<{
	available: boolean;
	issues: ScheduleAvailabilityIssue[];
	policy: { minDurationMinutes: number; maxDurationMinutes: number };
}> {
	const existing = await prisma.lesson.findFirst({
		where: { id: body.lessonId, deletedAt: null },
		select: {
			id: true,
			status: true,
			studentId: true,
			instructorId: true,
			vehicleId: true,
			startTime: true,
			endTime: true,
			course: {
				select: {
					id: true,
					schoolId: true,
					instructorId: true,
					courseTypeId: true,
					kind: true,
					totalHours: true,
				},
			},
		},
	});

	if (!existing) {
		throw AppError.notFound('Lesson not found');
	}
	await assertActorCanBookLessonForCourse(actor, existing.course.schoolId);
	assertLessonIsEditable(existing.status, existing.endTime);
	assertLessonHasNotStarted(existing.status, existing.startTime);

	const { start, end, durationMinutes } = parsePolishScheduleWindow(body);
	const timeChanged =
		start.getTime() !== existing.startTime.getTime() ||
		end.getTime() !== existing.endTime.getTime();
	const instructorChanged = body.instructorId !== existing.instructorId;
	const vehicleChanged = body.vehicleId !== existing.vehicleId;
	const scheduleChanged = timeChanged || instructorChanged || vehicleChanged;
	const policy = await resolveScheduleDurationPolicy(
		prisma,
		existing.course.schoolId,
		'PRACTICE',
	);
	const issues: ScheduleAvailabilityIssue[] = [];

	if (!scheduleChanged) {
		return { available: true, issues, policy };
	}

	if (timeChanged) {
		pushDurationIssue(issues, durationMinutes, policy);
		try {
			await assertLessonTimeIsBookable(start, existing.course.schoolId);
		} catch (error) {
			expectedScheduleReason(error, [
				'DATE_NOT_BOOKABLE',
				'SCHOOL_CLOSED',
			]);
			issues.push({ code: 'DATE_NOT_BOOKABLE', field: 'date' });
		}
	}

	const instructorLink = await prisma.instructorSchool.findFirst({
		where: {
			instructorId: body.instructorId,
			schoolId: existing.course.schoolId,
		},
		select: { id: true },
	});
	if (!instructorLink) {
		issues.push({
			code: 'INSTRUCTOR_NOT_ELIGIBLE',
			field: 'instructorId',
		});
	} else if (instructorChanged) {
		try {
			await assertInstructorQualifiedForCourseType(
				body.instructorId,
				existing.course.courseTypeId,
			);
		} catch (error) {
			expectedClientError(error);
			issues.push({
				code: 'INSTRUCTOR_NOT_ELIGIBLE',
				field: 'instructorId',
			});
		}
	}

	try {
		const vehicleInSchool = await prisma.vehicle.findFirst({
			where: {
				id: body.vehicleId,
				schoolId: existing.course.schoolId,
				isActive: true,
			},
			select: { id: true },
		});
		if (!vehicleInSchool) {
			throw ScheduleDomainError.badRequestFor(
				'VEHICLE_UNAVAILABLE',
				'Vehicle is not for this driving school',
			);
		}
		await assertVehicleSupportsCourseType(
			prisma,
			body.vehicleId,
			existing.course.courseTypeId,
		);
		await validateVehicleForInstructor(
			body.instructorId,
			body.vehicleId,
			prisma,
			{ requireAvailable: true },
		);
	} catch (error) {
		issues.push({
			code: scheduleIssueCode(error, [
				'VEHICLE_UNAVAILABLE',
				'VEHICLE_COURSE_TYPE_MISMATCH',
			]),
			field: 'vehicleId',
		});
	}

	await prisma.$transaction(async (tx) => {
		if (timeChanged || instructorChanged) {
			try {
				await assertLessonSchedulingWindowAvailable(tx, {
					instructorId: body.instructorId,
					studentProfileId: existing.studentId,
					courseId: existing.course.id,
					courseKind: existing.course.kind,
					totalHours: existing.course.totalHours,
					start,
					end,
					excludeLessonId: existing.id,
				});
			} catch (error) {
				issues.push(lessonScheduleIssue(error));
			}
		}

		if (
			await vehicleHasBookingConflict(tx, body.vehicleId, start, end, {
				excludeLessonId: existing.id,
			})
		) {
			issues.push({ code: 'VEHICLE_BUSY', field: 'vehicleId' });
		}
	});

	return { available: issues.length === 0, issues, policy };
}
