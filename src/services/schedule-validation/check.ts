import { EventType, LessonStatus, Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { assertInstructorQualifiedForCourseType } from '../../lib/instructorCourseQualification';
import { getPrisma } from '../../lib/prisma';
import { parsePolishScheduleWindow } from '../../lib/polishScheduleTime';
import { validateVehicleForInstructor } from '../../lib/vehicle.helpers';
import type { ScheduleAvailabilityCheckBody } from '../../schemas/schedule.schemas';
import {
	assertActorCanManageAvailability,
	resolveActiveInstructorProfile,
} from '../instructor-availability.service';
import { assertCourseEligibleForInstructorEvent } from '../event/courseEligibility';
import { resolveInstructorEventSchoolId } from '../event/writeModel';
import {
	assertInstructorEventWindowAvailable,
	assertVehicleAvailableForEventWindow,
} from '../event/writeConflicts';
import { resolveScheduleDurationPolicy } from './policy';
import {
	assertActorCanBookLessonForCourse,
	assertCourseCanBeSelfBooked,
	assertInstructorCanBookCourse,
	assertStudentParticipatesInCourse,
	loadCourseForBooking,
	loadStudentProfileIdForUser,
	type CourseForBooking,
} from '../lesson/bookingAccess';
import { assertLessonTimeIsBookable } from '../lesson/bookingRules';
import { assertLessonSchedulingWindowAvailable } from '../lesson/scheduleConflicts';
import {
	assertVehicleAvailableForBooking,
	findAvailableVehicleIdForStudentBooking,
	vehicleHasBookingConflict,
} from '../lesson/vehicleAvailability';

const prisma = getPrisma();

export type ScheduleAvailabilityIssueCode =
	| 'DURATION_TOO_SHORT'
	| 'DURATION_TOO_LONG'
	| 'INSTRUCTOR_BUSY'
	| 'OUTSIDE_INSTRUCTOR_HOURS'
	| 'INSTRUCTOR_NOT_ELIGIBLE'
	| 'PARTICIPANT_BUSY'
	| 'STUDENT_BUSY'
	| 'STUDENT_NOT_ELIGIBLE'
	| 'COURSE_LIMIT_EXCEEDED'
	| 'DATE_NOT_BOOKABLE'
	| 'VEHICLE_UNAVAILABLE'
	| 'VEHICLE_BUSY'
	| 'NO_VEHICLE_AVAILABLE'
	| 'COURSE_NOT_ELIGIBLE';

export interface ScheduleAvailabilityIssue {
	code: ScheduleAvailabilityIssueCode;
	field:
		| 'date'
		| 'startTime'
		| 'endTime'
		| 'instructorId'
		| 'vehicleId'
		| 'studentId'
		| 'courseId';
}

function instructorWindowIssueCode(
	error: AppError,
): 'INSTRUCTOR_BUSY' | 'OUTSIDE_INSTRUCTOR_HOURS' {
	return error.message === 'Slot outside instructor availability'
		? 'OUTSIDE_INSTRUCTOR_HOURS'
		: 'INSTRUCTOR_BUSY';
}

export async function checkScheduleAvailability(
	actor: { id: string; role: Role },
	body: ScheduleAvailabilityCheckBody,
): Promise<{
	available: boolean;
	issues: ScheduleAvailabilityIssue[];
	policy: { minDurationMinutes: number; maxDurationMinutes: number };
}> {
	if (body.intent === 'lesson_create') {
		return checkLessonCreateAvailability(actor, body);
	}

	if (body.intent === 'lesson_self_book') {
		return checkLessonSelfBookAvailability(actor, body);
	}

	if (body.intent === 'lesson_edit') {
		return checkLessonEditAvailability(actor, body);
	}

	if (body.intent === 'event_edit') {
		return checkEventEditAvailability(actor, body);
	}

	return checkEventCreateAvailability(actor, body);
}

async function checkLessonCreateAvailability(
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
		if (!(error instanceof AppError)) throw error;
		issues.push({ code: 'STUDENT_NOT_ELIGIBLE', field: 'studentId' });
	}

	const instructorEligible = await pushLessonInstructorIssue(
		issues,
		body.instructorId,
		course,
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
			);
		} catch (error) {
			if (!(error instanceof AppError)) throw error;
			issues.push({
				code: error.message.includes('already in use')
					? 'VEHICLE_BUSY'
					: 'VEHICLE_UNAVAILABLE',
				field: 'vehicleId',
			});
		}
	});

	return { available: issues.length === 0, issues, policy };
}

async function checkLessonSelfBookAvailability(
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

	try {
		assertCourseCanBeSelfBooked(course);
	} catch (error) {
		if (!(error instanceof AppError)) throw error;
		issues.push({ code: 'COURSE_NOT_ELIGIBLE', field: 'courseId' });
		return { available: false, issues, policy };
	}

	pushDurationIssue(issues, durationMinutes, policy);
	await pushLessonDateIssue(issues, start, course.schoolId);

	const studentProfileId = await loadStudentProfileIdForUser(actor.id);
	let studentEligible = true;
	try {
		await assertStudentParticipatesInCourse(course.id, studentProfileId, {
			requireActive: true,
		});
	} catch (error) {
		if (!(error instanceof AppError)) throw error;
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
			await findAvailableVehicleIdForStudentBooking(
				tx,
				body.instructorId,
				course.schoolId,
				start,
				end,
			);
		} catch (error) {
			if (!(error instanceof AppError)) throw error;
			issues.push({
				code: 'NO_VEHICLE_AVAILABLE',
				field: 'vehicleId',
			});
		}
	});

	return { available: issues.length === 0, issues, policy };
}

async function checkLessonEditAvailability(
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
	if (existing.status !== LessonStatus.SCHEDULED) {
		throw AppError.badRequest('Only scheduled lessons can be edited');
	}

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
			if (!(error instanceof AppError)) throw error;
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
	if (
		!instructorLink ||
		(existing.course.instructorId != null &&
			existing.course.instructorId !== body.instructorId)
	) {
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
			if (!(error instanceof AppError)) throw error;
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
			throw AppError.badRequest('Vehicle is not for this driving school');
		}
		await validateVehicleForInstructor(
			body.instructorId,
			body.vehicleId,
			prisma,
			{ requireAvailable: true },
		);
	} catch (error) {
		if (!(error instanceof AppError)) throw error;
		issues.push({ code: 'VEHICLE_UNAVAILABLE', field: 'vehicleId' });
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
				if (!(error instanceof AppError)) throw error;
				const code = error.message.includes('Student')
					? 'STUDENT_BUSY'
					: error.message.includes('package limit')
						? 'COURSE_LIMIT_EXCEEDED'
						: instructorWindowIssueCode(error);
				issues.push({
					code,
					field:
						code === 'STUDENT_BUSY'
							? 'studentId'
							: code === 'COURSE_LIMIT_EXCEEDED'
								? 'courseId'
								: 'instructorId',
				});
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

async function checkEventCreateAvailability(
	actor: { id: string; role: Role },
	body: Extract<ScheduleAvailabilityCheckBody, { intent: 'event_create' }>,
) {
	await assertActorCanManageAvailability(actor, body.instructorId);
	await resolveActiveInstructorProfile(body.instructorId);

	const { start, end, durationMinutes } = parsePolishScheduleWindow(body);
	const schoolId = await resolveInstructorEventSchoolId({
		instructorId: body.instructorId,
		courseId: body.courseId,
		vehicleId: body.vehicleId,
	});
	const policy = await resolveScheduleDurationPolicy(
		prisma,
		schoolId,
		body.eventType,
	);
	const issues: ScheduleAvailabilityIssue[] = [];

	if (durationMinutes < policy.minDurationMinutes) {
		issues.push({ code: 'DURATION_TOO_SHORT', field: 'endTime' });
	} else if (durationMinutes > policy.maxDurationMinutes) {
		issues.push({ code: 'DURATION_TOO_LONG', field: 'endTime' });
	}

	if (body.eventType === EventType.THEORY && body.courseId) {
		try {
			await assertCourseEligibleForInstructorEvent(
				body.instructorId,
				body.courseId,
			);
		} catch (error) {
			if (!(error instanceof AppError)) throw error;
			issues.push({ code: 'COURSE_NOT_ELIGIBLE', field: 'courseId' });
		}
	}

	if (body.eventType === EventType.DRIVE && body.vehicleId) {
		try {
			await validateVehicleForInstructor(
				body.instructorId,
				body.vehicleId,
				prisma,
				{ requireAvailable: true },
			);
		} catch (error) {
			if (!(error instanceof AppError)) throw error;
			issues.push({ code: 'VEHICLE_UNAVAILABLE', field: 'vehicleId' });
		}
	}

	await prisma.$transaction(async (tx) => {
		try {
			await assertInstructorEventWindowAvailable(tx, {
				instructorId: body.instructorId,
				start,
				end,
			});
		} catch (error) {
			if (!(error instanceof AppError)) throw error;
			issues.push({
				code: instructorWindowIssueCode(error),
				field: 'instructorId',
			});
		}

		if (body.eventType === EventType.DRIVE && body.vehicleId) {
			try {
				await assertVehicleAvailableForEventWindow(tx, {
					vehicleId: body.vehicleId,
					start,
					end,
				});
			} catch (error) {
				if (!(error instanceof AppError)) throw error;
				issues.push({ code: 'VEHICLE_BUSY', field: 'vehicleId' });
			}
		}
	});

	return { available: issues.length === 0, issues, policy };
}

async function checkEventEditAvailability(
	actor: { id: string; role: Role },
	body: Extract<ScheduleAvailabilityCheckBody, { intent: 'event_edit' }>,
): Promise<{
	available: boolean;
	issues: ScheduleAvailabilityIssue[];
	policy: { minDurationMinutes: number; maxDurationMinutes: number };
}> {
	const current = await prisma.instructorEvent.findUnique({
		where: { id: body.eventId },
		select: {
			id: true,
			isActive: true,
			instructorId: true,
			courseId: true,
			type: true,
			startTime: true,
			endTime: true,
			vehicleId: true,
		},
	});

	if (!current?.isActive) {
		throw AppError.notFound('Event not found');
	}

	await assertActorCanManageAvailability(actor, current.instructorId);

	const instructorChanged = body.instructorId !== current.instructorId;
	if (instructorChanged) {
		await assertActorCanManageAvailability(actor, body.instructorId);
		await resolveActiveInstructorProfile(body.instructorId);
	}

	if (current.type === EventType.THEORY && body.vehicleId) {
		throw AppError.badRequest('vehicleId is only allowed for DRIVE events');
	}

	const { start, end, durationMinutes } = parsePolishScheduleWindow(body);
	const vehicleId =
		current.type === EventType.DRIVE
			? (body.vehicleId ?? current.vehicleId ?? undefined)
			: undefined;

	if (current.type === EventType.DRIVE && !vehicleId) {
		throw AppError.badRequest('vehicleId is required for DRIVE events');
	}

	const schoolId = await resolveInstructorEventSchoolId({
		instructorId: body.instructorId,
		courseId: current.courseId,
		vehicleId,
	});
	const policy = await resolveScheduleDurationPolicy(
		prisma,
		schoolId,
		current.type,
	);
	const timeChanged =
		start.getTime() !== current.startTime.getTime() ||
		end.getTime() !== current.endTime.getTime();
	const vehicleChanged = vehicleId !== (current.vehicleId ?? undefined);
	const scheduleChanged = timeChanged || instructorChanged || vehicleChanged;
	const issues: ScheduleAvailabilityIssue[] = [];

	if (!scheduleChanged) {
		return { available: true, issues, policy };
	}

	if (timeChanged) {
		pushDurationIssue(issues, durationMinutes, policy);
	}

	if (
		current.type === EventType.THEORY &&
		current.courseId &&
		instructorChanged
	) {
		try {
			await assertCourseEligibleForInstructorEvent(
				body.instructorId,
				current.courseId,
			);
		} catch (error) {
			if (!(error instanceof AppError)) throw error;
			issues.push({ code: 'COURSE_NOT_ELIGIBLE', field: 'courseId' });
		}
	}

	if (current.type === EventType.DRIVE && vehicleId) {
		try {
			await validateVehicleForInstructor(
				body.instructorId,
				vehicleId,
				prisma,
				{ requireAvailable: true },
			);
		} catch (error) {
			if (!(error instanceof AppError)) throw error;
			issues.push({ code: 'VEHICLE_UNAVAILABLE', field: 'vehicleId' });
		}
	}

	await prisma.$transaction(async (tx) => {
		if (timeChanged || instructorChanged) {
			try {
				await assertInstructorEventWindowAvailable(tx, {
					instructorId: body.instructorId,
					start,
					end,
					eventId: current.id,
					checkExistingParticipantsForEventId: current.id,
				});
			} catch (error) {
				if (!(error instanceof AppError)) throw error;
				issues.push({
					code: error.message.includes('participant schedules')
						? 'PARTICIPANT_BUSY'
						: instructorWindowIssueCode(error),
					field: 'instructorId',
				});
			}
		}

		if (current.type === EventType.DRIVE && vehicleId) {
			try {
				await assertVehicleAvailableForEventWindow(tx, {
					vehicleId,
					start,
					end,
					eventId: current.id,
				});
			} catch (error) {
				if (!(error instanceof AppError)) throw error;
				issues.push({ code: 'VEHICLE_BUSY', field: 'vehicleId' });
			}
		}
	});

	return { available: issues.length === 0, issues, policy };
}

function pushDurationIssue(
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

async function pushLessonDateIssue(
	issues: ScheduleAvailabilityIssue[],
	start: Date,
	schoolId: string,
): Promise<void> {
	try {
		await assertLessonTimeIsBookable(start, schoolId);
	} catch (error) {
		if (!(error instanceof AppError)) throw error;
		issues.push({ code: 'DATE_NOT_BOOKABLE', field: 'date' });
	}
}

async function pushLessonInstructorIssue(
	issues: ScheduleAvailabilityIssue[],
	instructorId: string,
	course: CourseForBooking,
): Promise<boolean> {
	try {
		await assertInstructorCanBookCourse(instructorId, course);
		return true;
	} catch (error) {
		if (!(error instanceof AppError)) throw error;
		issues.push({
			code: 'INSTRUCTOR_NOT_ELIGIBLE',
			field: 'instructorId',
		});
		return false;
	}
}

async function pushLessonScheduleIssue(
	issues: ScheduleAvailabilityIssue[],
	check: () => Promise<void>,
): Promise<void> {
	try {
		await check();
	} catch (error) {
		if (!(error instanceof AppError)) throw error;
		const code = error.message.includes('Student')
			? 'STUDENT_BUSY'
			: error.message.includes('package limit')
				? 'COURSE_LIMIT_EXCEEDED'
				: instructorWindowIssueCode(error);
		issues.push({
			code,
			field:
				code === 'STUDENT_BUSY'
					? 'studentId'
					: code === 'COURSE_LIMIT_EXCEEDED'
						? 'courseId'
						: 'instructorId',
		});
	}
}
