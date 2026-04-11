import { EventType, LessonStatus, Role } from '@prisma/client';
import { AppError } from '../lib/http/AppError';
import { getPrisma } from '../lib/prisma';
import type { CreateInstructorEventBody } from '../schemas/event.schemas';
import {
	assertActorCanManageAvailability,
	assertInstructorTimeWindowAvailable,
	resolveActiveInstructorProfile,
} from './instructor-availability.service';

const prisma = getPrisma();

export type InstructorEventDto = {
	id: string;
	instructorId: string;
	type: EventType;
	startTime: string;
	endTime: string;
	vehicleId: string | null;
	createdAt: string;
};

async function validateVehicleForInstructor(
	instructorId: string,
	vehicleId: string,
): Promise<void> {
	const vehicle = await prisma.vehicle.findFirst({
		where: { id: vehicleId, isActive: true },
		select: { id: true, schoolId: true },
	});
	if (!vehicle) {
		throw AppError.notFound('Vehicle not found');
	}
	const link = await prisma.instructorSchool.findFirst({
		where: { instructorId, schoolId: vehicle.schoolId },
		select: { id: true },
	});
	if (!link) {
		throw AppError.badRequest(
			'Vehicle is not in a school assigned to this instructor',
		);
	}
}

export async function createInstructorEvent(
	actor: { id: string; role: Role },
	body: CreateInstructorEventBody,
): Promise<{ event: InstructorEventDto }> {
	const { instructorId, type, startTime, endTime, vehicleId } = body;

	await assertActorCanManageAvailability(actor, instructorId);
	await resolveActiveInstructorProfile(instructorId);

	const start = new Date(startTime);
	const end = new Date(endTime);

	if (type === EventType.DRIVE) {
		if (!vehicleId) {
			throw AppError.badRequest('vehicleId is required for DRIVE events');
		}
		await validateVehicleForInstructor(instructorId, vehicleId);
	}

	await assertInstructorTimeWindowAvailable(instructorId, start, end);

	const resolvedVehicleId = type === EventType.DRIVE ? vehicleId! : null;

	const row = await prisma.$transaction(async (tx) => {
		const lessonConflict = await tx.lesson.findFirst({
			where: {
				instructorId,
				status: { not: LessonStatus.CANCELLED },
				startTime: { lt: end },
				endTime: { gt: start },
			},
			select: { id: true },
		});
		if (lessonConflict) {
			throw AppError.conflict('Time slot conflicts with a lesson');
		}

		const eventConflict = await tx.instructorEvent.findFirst({
			where: {
				instructorId,
				startTime: { lt: end },
				endTime: { gt: start },
			},
			select: { id: true },
		});
		if (eventConflict) {
			throw AppError.conflict(
				'Time slot conflicts with a scheduled block',
			);
		}

		if (type === EventType.DRIVE && resolvedVehicleId) {
			const vehicleLessonConflict = await tx.lesson.findFirst({
				where: {
					vehicleId: resolvedVehicleId,
					status: { not: LessonStatus.CANCELLED },
					startTime: { lt: end },
					endTime: { gt: start },
				},
				select: { id: true },
			});
			if (vehicleLessonConflict) {
				throw AppError.conflict('Vehicle is already in use');
			}

			const vehicleEventConflict = await tx.instructorEvent.findFirst({
				where: {
					vehicleId: resolvedVehicleId,
					type: EventType.DRIVE,
					startTime: { lt: end },
					endTime: { gt: start },
				},
				select: { id: true },
			});
			if (vehicleEventConflict) {
				throw AppError.conflict('Vehicle is already in use');
			}
		}

		return tx.instructorEvent.create({
			data: {
				instructorId,
				type,
				startTime: start,
				endTime: end,
				vehicleId: resolvedVehicleId,
			},
			select: {
				id: true,
				instructorId: true,
				type: true,
				startTime: true,
				endTime: true,
				vehicleId: true,
				createdAt: true,
			},
		});
	});

	return {
		event: {
			id: row.id,
			instructorId: row.instructorId,
			type: row.type,
			startTime: row.startTime.toISOString(),
			endTime: row.endTime.toISOString(),
			vehicleId: row.vehicleId,
			createdAt: row.createdAt.toISOString(),
		},
	};
}
