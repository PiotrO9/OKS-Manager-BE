import { EventType, Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { validateVehicleForInstructor } from '../../lib/vehicle.helpers';
import { getPrisma } from '../../lib/prisma';
import type {
	CreateInstructorEventBody,
	PatchInstructorEventBody,
} from '../../schemas/event.schemas';
import {
	assertActorCanManageAvailability,
	resolveActiveInstructorProfile,
} from '../instructor-availability.service';
import { assertCourseEligibleForInstructorEvent } from './courseEligibility';
import type { InstructorEventDto } from './mappers';
import {
	assertEventCapacityFitsParticipants,
	assertInstructorEventWindowAvailable,
	assertVehicleAvailableForEventWindow,
} from './writeConflicts';
import {
	instructorEventWriteSelect,
	mapInstructorEventWriteDto,
} from './writeModelMappers';

const prisma = getPrisma();

export { bulkUpdateEventStatus } from './bulkStatus';
export { deleteInstructorEvent } from './deleteEvent';

export async function createInstructorEvent(
	actor: { id: string; role: Role },
	body: CreateInstructorEventBody,
): Promise<{ event: InstructorEventDto }> {
	const {
		instructorId,
		type,
		startTime,
		endTime,
		vehicleId,
		capacity,
		courseId,
	} = body;

	await assertActorCanManageAvailability(actor, instructorId);
	await resolveActiveInstructorProfile(instructorId);
	const schoolId = await resolveInstructorEventSchoolId({
		instructorId,
		courseId,
		vehicleId,
	});

	if (courseId) {
		await assertCourseEligibleForInstructorEvent(instructorId, courseId);
	}

	const start = new Date(startTime);
	const end = new Date(endTime);

	if (type === EventType.DRIVE) {
		if (!vehicleId) {
			throw AppError.badRequest('vehicleId is required for DRIVE events');
		}
		await validateVehicleForInstructor(instructorId, vehicleId, prisma);
	}

	const resolvedVehicleId = type === EventType.DRIVE ? vehicleId! : null;

	const row = await prisma.$transaction(async (tx) => {
		await assertInstructorEventWindowAvailable(tx, {
			instructorId,
			start,
			end,
		});

		if (type === EventType.DRIVE && resolvedVehicleId) {
			await assertVehicleAvailableForEventWindow(tx, {
				vehicleId: resolvedVehicleId,
				start,
				end,
			});
		}

		const created = await tx.instructorEvent.create({
			data: {
				instructorId,
				schoolId,
				courseId: courseId ?? null,
				type,
				startTime: start,
				endTime: end,
				vehicleId: resolvedVehicleId,
				capacity: capacity ?? null,
			},
			select: instructorEventWriteSelect,
		});

		return created;
	});

	return { event: mapInstructorEventWriteDto(row) };
}

export async function updateInstructorEvent(
	actor: { id: string; role: Role },
	eventId: string,
	body: PatchInstructorEventBody,
): Promise<{ event: InstructorEventDto }> {
	const current = await prisma.instructorEvent.findUnique({
		where: { id: eventId },
		select: {
			id: true,
			instructorId: true,
			isActive: true,
			courseId: true,
			schoolId: true,
			type: true,
			status: true,
			startTime: true,
			endTime: true,
			vehicleId: true,
			capacity: true,
		},
	});

	if (!current) {
		throw AppError.notFound('Event not found');
	}
	if (!current.isActive) {
		throw AppError.notFound('Event not found');
	}

	await assertActorCanManageAvailability(actor, current.instructorId);

	if (
		body.instructorId !== undefined &&
		body.instructorId !== current.instructorId
	) {
		await assertActorCanManageAvailability(actor, body.instructorId);
		await resolveActiveInstructorProfile(body.instructorId);
	}

	const mergedInstructorId = body.instructorId ?? current.instructorId;
	const mergedCourseId = current.courseId;
	const mergedType = body.type ?? current.type;
	const mergedStatus = body.status ?? current.status;
	const mergedStart = body.startTime
		? new Date(body.startTime)
		: current.startTime;
	const mergedEnd = body.endTime ? new Date(body.endTime) : current.endTime;
	const mergedVehicleId =
		body.vehicleId !== undefined ? body.vehicleId : current.vehicleId;
	const mergedCapacity =
		body.capacity !== undefined ? body.capacity : current.capacity;

	if (mergedStart.getTime() >= mergedEnd.getTime()) {
		throw AppError.badRequest('startTime must be before endTime');
	}

	if (
		mergedCourseId !== null &&
		mergedType === EventType.THEORY &&
		(body.instructorId !== undefined || body.type !== undefined)
	) {
		await assertCourseEligibleForInstructorEvent(
			mergedInstructorId,
			mergedCourseId,
		);
	}

	if (mergedType === EventType.DRIVE) {
		if (!mergedVehicleId) {
			throw AppError.badRequest('vehicleId is required for DRIVE events');
		}
		await validateVehicleForInstructor(
			mergedInstructorId,
			mergedVehicleId,
			prisma,
		);
	}

	const resolvedVehicleId =
		mergedType === EventType.DRIVE ? mergedVehicleId : null;
	const mergedSchoolId = await resolveInstructorEventSchoolId({
		instructorId: mergedInstructorId,
		courseId: mergedCourseId,
		vehicleId: resolvedVehicleId ?? undefined,
	});

	const timeChanged =
		body.startTime !== undefined || body.endTime !== undefined;
	const instructorChanged =
		body.instructorId !== undefined &&
		body.instructorId !== current.instructorId;
	const needsTimeValidation = timeChanged || instructorChanged;

	const row = await prisma.$transaction(async (tx) => {
		if (needsTimeValidation) {
			await assertInstructorEventWindowAvailable(tx, {
				instructorId: mergedInstructorId,
				start: mergedStart,
				end: mergedEnd,
				eventId,
				checkExistingParticipantsForEventId: eventId,
			});
		}

		if (mergedType === EventType.DRIVE && resolvedVehicleId) {
			await assertVehicleAvailableForEventWindow(tx, {
				vehicleId: resolvedVehicleId,
				start: mergedStart,
				end: mergedEnd,
				eventId,
			});
		}

		await assertEventCapacityFitsParticipants(tx, eventId, mergedCapacity);

		return tx.instructorEvent.update({
			where: { id: eventId },
			data: {
				instructorId: mergedInstructorId,
				schoolId: mergedSchoolId,
				type: mergedType,
				status: mergedStatus,
				startTime: mergedStart,
				endTime: mergedEnd,
				vehicleId: resolvedVehicleId,
				capacity: mergedCapacity ?? null,
			},
			select: instructorEventWriteSelect,
		});
	});

	return { event: mapInstructorEventWriteDto(row) };
}

async function resolveInstructorEventSchoolId(input: {
	instructorId: string;
	courseId?: string | null;
	vehicleId?: string | null;
}): Promise<string> {
	const link = await prisma.instructorSchool.findFirst({
		where: {
			instructorId: input.instructorId,
			school: { deletedAt: null },
		},
		select: { schoolId: true },
	});

	if (!link) {
		throw AppError.unprocessableEntity(
			'Instructor is not assigned to a driving school',
		);
	}

	if (input.courseId) {
		const course = await prisma.course.findFirst({
			where: { id: input.courseId, deletedAt: null },
			select: { schoolId: true },
		});
		if (!course) {
			throw AppError.notFound('Course not found');
		}
		if (course.schoolId !== link.schoolId) {
			throw AppError.unprocessableEntity(
				'Course is not in the instructor driving school',
			);
		}
	}

	if (input.vehicleId) {
		const vehicle = await prisma.vehicle.findFirst({
			where: { id: input.vehicleId, isActive: true },
			select: { schoolId: true },
		});
		if (!vehicle) {
			throw AppError.notFound('Vehicle not found');
		}
		if (vehicle.schoolId !== link.schoolId) {
			throw AppError.badRequest(
				'Vehicle is not in the instructor driving school',
			);
		}
	}

	return link.schoolId;
}
