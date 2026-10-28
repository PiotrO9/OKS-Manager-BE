import { assertVehicleSupportsCourse } from '../../lib/vehicleCourseCategories';
import { EventType, Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
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
import { scheduleCheckDatabase as prisma } from './checkDatabase';
import type { ScheduleAvailabilityIssue } from './checkTypes';
import {
	expectedClientError,
	scheduleIssueCode,
	pushDurationIssue,
} from './checkIssues';

export async function checkEventCreateAvailability(
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
			expectedClientError(error);
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
			scheduleIssueCode(error, ['VEHICLE_UNAVAILABLE']);
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
			const code = scheduleIssueCode(error, [
				'INSTRUCTOR_BUSY',
				'OUTSIDE_INSTRUCTOR_HOURS',
			]);
			issues.push({
				code,
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
				scheduleIssueCode(error, ['VEHICLE_BUSY']);
				issues.push({ code: 'VEHICLE_BUSY', field: 'vehicleId' });
			}
		}
	});

	return { available: issues.length === 0, issues, policy };
}

export async function checkEventEditAvailability(
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
			expectedClientError(error);
			issues.push({ code: 'COURSE_NOT_ELIGIBLE', field: 'courseId' });
		}
	}

	if (current.type === EventType.DRIVE && vehicleId) {
		try {
			if (current.courseId)
				await assertVehicleSupportsCourse(
					prisma,
					vehicleId,
					current.courseId,
				);
			await validateVehicleForInstructor(
				body.instructorId,
				vehicleId,
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
				const code = scheduleIssueCode(error, [
					'PARTICIPANT_BUSY',
					'INSTRUCTOR_BUSY',
					'OUTSIDE_INSTRUCTOR_HOURS',
				]);
				issues.push({
					code,
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
				scheduleIssueCode(error, ['VEHICLE_BUSY']);
				issues.push({ code: 'VEHICLE_BUSY', field: 'vehicleId' });
			}
		}
	});

	return { available: issues.length === 0, issues, policy };
}
