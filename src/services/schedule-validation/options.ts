import { CourseKind, EventType, LessonStatus, Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { ScheduleDomainError } from '../../lib/http/ScheduleDomainError';
import { assertInstructorQualifiedForCourseType } from '../../lib/instructorCourseQualification';
import {
	instantToPolishDateTime,
	polishTodayYyyymmdd,
} from '../../lib/polishScheduleTime';
import { getPrisma } from '../../lib/prisma';
import { validateVehicleForInstructor } from '../../lib/vehicle.helpers';
import type { ScheduleAvailabilityOptionsBody } from '../../schemas/schedule.schemas';
import {
	assertActorCanManageAvailability,
	computeDayWindows,
	resolveActiveInstructorProfile,
} from '../instructor-availability.service';
import {
	yyyymmddToDate,
	type TimeWindow,
} from '../instructor-availability/time';
import { assertCourseEligibleForInstructorEvent } from '../event/courseEligibility';
import { resolveInstructorEventSchoolId } from '../event/writeModel';
import { assertActorCanBookLessonForCourse } from '../lesson/bookingAccess';
import { assertLessonDateInsideBookingWindow } from '../lesson/bookingRules';
import { assertLessonIsEditable } from '../lesson/editability';
import { subtractStudentScheduleConflicts } from './conflicts';
import {
	AVAILABILITY_OPTION_STEP_MINUTES,
	buildScheduleAvailabilityOptions,
	type ScheduleAvailabilityOption,
} from './optionsMatrix';
import { resolveScheduleOptionsPolicy } from './policy';
import { resolveAvailableVehicleWindows } from './vehicleWindows';

export { buildScheduleAvailabilityOptions } from './optionsMatrix';

const prisma = getPrisma();
const OPTION_STEP_MINUTES = AVAILABILITY_OPTION_STEP_MINUTES;

export async function getScheduleAvailabilityOptions(
	actor: { id: string; role: Role },
	body: ScheduleAvailabilityOptionsBody,
): Promise<{
	stepMinutes: number;
	options: ScheduleAvailabilityOption[];
	availableVehicleIds?: string[];
	policy: { minDurationMinutes: number; maxDurationMinutes: number };
	emptyReason?:
		| 'SCHOOL_CLOSED'
		| 'DATE_NOT_BOOKABLE'
		| 'INSTRUCTOR_UNAVAILABLE'
		| 'COURSE_LIMIT_EXCEEDED'
		| 'STUDENT_BUSY'
		| 'VEHICLE_UNAVAILABLE'
		| 'NO_FREE_TIME';
}> {
	if (body.intent === 'event_edit') {
		return getEventEditAvailabilityOptions(actor, body);
	}

	if (body.intent === 'lesson_edit') {
		return getLessonEditAvailabilityOptions(actor, body);
	}

	return getEventCreateAvailabilityOptions(actor, body);
}

async function getEventCreateAvailabilityOptions(
	actor: { id: string; role: Role },
	body: Extract<ScheduleAvailabilityOptionsBody, { intent: 'event_create' }>,
) {
	await assertActorCanManageAvailability(actor, body.instructorId);
	await resolveActiveInstructorProfile(body.instructorId);

	const schoolId = await resolveInstructorEventSchoolId({
		instructorId: body.instructorId,
		courseId: body.courseId,
		vehicleId: body.vehicleId,
	});
	const date = yyyymmddToDate(body.date);
	const [optionsPolicy, dayWindows] = await Promise.all([
		resolveScheduleOptionsPolicy(
			prisma,
			schoolId,
			body.eventType,
			OPTION_STEP_MINUTES,
		),
		computeDayWindows(body.instructorId, date),
		body.eventType === EventType.THEORY && body.courseId
			? assertCourseEligibleForInstructorEvent(
					body.instructorId,
					body.courseId,
				)
			: Promise.resolve(),
		body.eventType === EventType.DRIVE && body.vehicleId
			? validateVehicleForInstructor(
					body.instructorId,
					body.vehicleId,
					prisma,
					{ requireAvailable: true },
				)
			: Promise.resolve(),
	]);
	const { startStepMinutes, ...policy } = optionsPolicy;
	let windows = dayWindows ?? [];

	let availableVehicleIds: string[] | undefined;

	if (body.eventType === EventType.DRIVE) {
		const vehicleWindows = await resolveAvailableVehicleWindows(
			schoolId,
			date,
			windows,
			policy,
			startStepMinutes,
			{},
		);

		availableVehicleIds = [...vehicleWindows.keys()];
		windows = body.vehicleId
			? (vehicleWindows.get(body.vehicleId) ?? [])
			: [];
	}

	return {
		stepMinutes: OPTION_STEP_MINUTES,
		options: buildScheduleAvailabilityOptions({
			windows,
			...policy,
			startStepMinutes,
		}),
		...(availableVehicleIds ? { availableVehicleIds } : {}),
		policy,
	};
}

async function getEventEditAvailabilityOptions(
	actor: { id: string; role: Role },
	body: Extract<ScheduleAvailabilityOptionsBody, { intent: 'event_edit' }>,
) {
	const current = await prisma.instructorEvent.findUnique({
		where: { id: body.eventId },
		select: {
			id: true,
			isActive: true,
			instructorId: true,
			schoolId: true,
			courseId: true,
			type: true,
		},
	});

	if (!current?.isActive) throw AppError.notFound('Event not found');

	await assertActorCanManageAvailability(actor, current.instructorId);
	await Promise.all([
		assertActorCanManageAvailability(actor, body.instructorId),
		resolveActiveInstructorProfile(body.instructorId),
	]);

	if (current.type === EventType.THEORY && body.vehicleId) {
		throw AppError.badRequest('vehicleId is only allowed for DRIVE events');
	}
	const date = yyyymmddToDate(body.date);
	const [optionsPolicy, dayWindows] = await Promise.all([
		resolveScheduleOptionsPolicy(
			prisma,
			current.schoolId,
			current.type,
			OPTION_STEP_MINUTES,
		),
		computeDayWindows(body.instructorId, date, prisma, current.id),
		current.type === EventType.THEORY && current.courseId
			? assertCourseEligibleForInstructorEvent(
					body.instructorId,
					current.courseId,
				)
			: Promise.resolve(),
		current.type === EventType.DRIVE && body.vehicleId
			? validateVehicleForInstructor(
					body.instructorId,
					body.vehicleId,
					prisma,
					{ requireAvailable: true },
				)
			: Promise.resolve(),
	]);
	const { startStepMinutes, ...policy } = optionsPolicy;
	let windows = dayWindows ?? [];

	if (current.type === EventType.THEORY) {
		windows = await subtractParticipantConflicts(current.id, date, windows);
	}

	let availableVehicleIds: string[] | undefined;

	if (current.type === EventType.DRIVE) {
		const vehicleWindows = await resolveAvailableVehicleWindows(
			current.schoolId,
			date,
			windows,
			policy,
			startStepMinutes,
			{ excludeEventId: current.id },
		);

		availableVehicleIds = [...vehicleWindows.keys()];
		windows = body.vehicleId
			? (vehicleWindows.get(body.vehicleId) ?? [])
			: [];
	}

	return buildOptionsResponse(
		windows,
		policy,
		startStepMinutes,
		availableVehicleIds,
	);
}

async function getLessonEditAvailabilityOptions(
	actor: { id: string; role: Role },
	body: Extract<ScheduleAvailabilityOptionsBody, { intent: 'lesson_edit' }>,
) {
	const lesson = await prisma.lesson.findFirst({
		where: { id: body.lessonId, deletedAt: null },
		select: {
			id: true,
			status: true,
			endTime: true,
			studentId: true,
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

	if (!lesson) throw AppError.notFound('Lesson not found');
	assertLessonIsEditable(lesson.status, lesson.endTime);

	await assertActorCanBookLessonForCourse(actor, lesson.course.schoolId);
	const [, instructorLink] = await Promise.all([
		resolveActiveInstructorProfile(body.instructorId),
		prisma.instructorSchool.findFirst({
			where: {
				instructorId: body.instructorId,
				schoolId: lesson.course.schoolId,
			},
			select: { id: true },
		}),
	]);
	if (
		!instructorLink ||
		(lesson.course.instructorId != null &&
			lesson.course.instructorId !== body.instructorId)
	) {
		throw AppError.badRequest('Instructor is not eligible for this course');
	}
	await assertInstructorQualifiedForCourseType(
		body.instructorId,
		lesson.course.courseTypeId,
	);

	const date = yyyymmddToDate(body.date);
	const [optionsPolicy, packageMinutes, dateIssue, dayWindows] =
		await Promise.all([
			resolveScheduleOptionsPolicy(
				prisma,
				lesson.course.schoolId,
				'PRACTICE',
				OPTION_STEP_MINUTES,
			),
			resolveRemainingCourseMinutes(
				lesson.course.id,
				lesson.studentId,
				lesson.course.kind,
				lesson.course.totalHours,
				lesson.id,
			),
			getLessonDateIssue(date, lesson.course.schoolId),
			computeDayWindows(
				body.instructorId,
				date,
				prisma,
				undefined,
				lesson.id,
			),
			body.vehicleId
				? validateVehicleForInstructor(
						body.instructorId,
						body.vehicleId,
						prisma,
						{ requireAvailable: true },
					)
				: Promise.resolve(),
		]);
	const { startStepMinutes, ...basePolicy } = optionsPolicy;
	const policy = {
		...basePolicy,
		maxDurationMinutes: Math.min(
			basePolicy.maxDurationMinutes,
			packageMinutes,
		),
	};
	if (dateIssue) {
		return {
			...buildOptionsResponse([], policy, startStepMinutes, []),
			emptyReason: dateIssue,
		};
	}
	if (dayWindows === null) {
		return {
			...buildOptionsResponse([], policy, startStepMinutes, []),
			emptyReason: 'INSTRUCTOR_UNAVAILABLE' as const,
		};
	}
	if (policy.maxDurationMinutes < policy.minDurationMinutes) {
		return {
			...buildOptionsResponse([], policy, startStepMinutes, []),
			emptyReason: 'COURSE_LIMIT_EXCEEDED' as const,
		};
	}

	let windows = dayWindows;
	const instructorHasFreeTime = windows.length > 0;

	windows = await subtractStudentScheduleConflicts(
		lesson.studentId,
		date,
		windows,
		{ excludeLessonId: lesson.id },
	);
	const studentHasFreeTime = windows.length > 0;
	if (body.date === polishTodayYyyymmdd()) {
		const nowMinutes = instantToPolishDateTime(new Date()).minutes;

		windows = windows
			.map((window) => ({
				...window,
				start: Math.max(window.start, nowMinutes),
			}))
			.filter((window) => window.start < window.end);
	}

	const vehicleWindows = await resolveAvailableVehicleWindows(
		lesson.course.schoolId,
		date,
		windows,
		policy,
		startStepMinutes,
		{ excludeLessonId: lesson.id },
	);
	const availableVehicleIds = [...vehicleWindows.keys()];

	windows = body.vehicleId ? (vehicleWindows.get(body.vehicleId) ?? []) : [];

	const response = buildOptionsResponse(
		windows,
		policy,
		startStepMinutes,
		availableVehicleIds,
	);
	if (response.options.length > 0) return response;

	return {
		...response,
		emptyReason: !instructorHasFreeTime
			? ('INSTRUCTOR_UNAVAILABLE' as const)
			: !studentHasFreeTime
				? ('STUDENT_BUSY' as const)
				: body.vehicleId && !vehicleWindows.has(body.vehicleId)
					? ('VEHICLE_UNAVAILABLE' as const)
					: ('NO_FREE_TIME' as const),
	};
}

async function resolveRemainingCourseMinutes(
	courseId: string,
	studentId: string,
	kind: CourseKind,
	totalHours: number,
	excludeLessonId: string,
): Promise<number> {
	if (kind !== CourseKind.PRACTICAL && kind !== CourseKind.EXTRA) {
		return Number.POSITIVE_INFINITY;
	}

	const lessons = await prisma.lesson.findMany({
		where: {
			courseId,
			studentId,
			status: { not: LessonStatus.CANCELLED },
			id: { not: excludeLessonId },
		},
		select: { startTime: true, endTime: true },
	});
	const usedMinutes = lessons.reduce(
		(sum, lesson) =>
			sum +
			Math.round(
				(lesson.endTime.getTime() - lesson.startTime.getTime()) /
					60_000,
			),
		0,
	);

	return Math.max(0, totalHours * 60 - usedMinutes);
}

async function getLessonDateIssue(
	date: Date,
	schoolId: string,
): Promise<'SCHOOL_CLOSED' | 'DATE_NOT_BOOKABLE' | null> {
	try {
		await assertLessonDateInsideBookingWindow(date, schoolId);

		return null;
	} catch (error) {
		return mapLessonDateError(error);
	}
}

export function mapLessonDateError(
	error: unknown,
): 'SCHOOL_CLOSED' | 'DATE_NOT_BOOKABLE' {
	if (!(error instanceof ScheduleDomainError)) throw error;
	if (error.reason === 'SCHOOL_CLOSED') return 'SCHOOL_CLOSED';
	if (error.reason === 'DATE_NOT_BOOKABLE') return 'DATE_NOT_BOOKABLE';
	throw error;
}

function buildOptionsResponse(
	windows: readonly TimeWindow[],
	policy: { minDurationMinutes: number; maxDurationMinutes: number },
	startStepMinutes: number,
	availableVehicleIds?: string[],
) {
	return {
		stepMinutes: OPTION_STEP_MINUTES,
		options: buildScheduleAvailabilityOptions({
			windows,
			...policy,
			startStepMinutes,
		}),
		...(availableVehicleIds ? { availableVehicleIds } : {}),
		policy,
	};
}

async function subtractParticipantConflicts(
	eventId: string,
	date: Date,
	windows: readonly TimeWindow[],
): Promise<TimeWindow[]> {
	const participants = await prisma.eventParticipant.findMany({
		where: { eventId },
		select: { studentId: true },
	});
	const studentIds = participants.map((participant) => participant.studentId);

	return subtractStudentScheduleConflicts(studentIds, date, windows, {
		excludeEventId: eventId,
	});
}
