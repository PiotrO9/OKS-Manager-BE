import { EventType, LessonStatus, Prisma } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { assertInstructorTimeWindowAvailable } from '../instructor-availability.service';
import { findStudentProfileIdsWithScheduleConflictsForEventWindow } from './conflicts';

type TransactionClient = Prisma.TransactionClient;

type EventWindowParams = {
	instructorId: string;
	start: Date;
	end: Date;
	eventId?: string;
	checkExistingParticipantsForEventId?: string;
};

export async function assertInstructorEventWindowAvailable(
	tx: TransactionClient,
	params: EventWindowParams,
): Promise<void> {
	await assertInstructorTimeWindowAvailable(
		params.instructorId,
		params.start,
		params.end,
		tx,
		params.eventId,
	);

	const lessonConflict = await tx.lesson.findFirst({
		where: {
			instructorId: params.instructorId,
			status: { not: LessonStatus.CANCELLED },
			startTime: { lt: params.end },
			endTime: { gt: params.start },
		},
		select: { id: true },
	});
	if (lessonConflict) {
		throw AppError.conflict('Time slot conflicts with a lesson');
	}

	const eventConflict = await tx.instructorEvent.findFirst({
		where: {
			instructorId: params.instructorId,
			...(params.eventId ? { id: { not: params.eventId } } : {}),
			isActive: true,
			startTime: { lt: params.end },
			endTime: { gt: params.start },
		},
		select: { id: true },
	});
	if (eventConflict) {
		throw AppError.conflict('Time slot conflicts with a scheduled block');
	}

	if (params.checkExistingParticipantsForEventId) {
		await assertExistingParticipantsHaveFreeWindow(tx, {
			eventId: params.checkExistingParticipantsForEventId,
			start: params.start,
			end: params.end,
		});
	}
}

export async function assertVehicleAvailableForEventWindow(
	tx: TransactionClient,
	params: {
		vehicleId: string;
		start: Date;
		end: Date;
		eventId?: string;
	},
): Promise<void> {
	const vehicleLessonConflict = await tx.lesson.findFirst({
		where: {
			vehicleId: params.vehicleId,
			status: { not: LessonStatus.CANCELLED },
			startTime: { lt: params.end },
			endTime: { gt: params.start },
		},
		select: { id: true },
	});
	if (vehicleLessonConflict) {
		throw AppError.conflict('Vehicle is already in use');
	}

	const vehicleEventConflict = await tx.instructorEvent.findFirst({
		where: {
			vehicleId: params.vehicleId,
			type: EventType.DRIVE,
			...(params.eventId ? { id: { not: params.eventId } } : {}),
			isActive: true,
			startTime: { lt: params.end },
			endTime: { gt: params.start },
		},
		select: { id: true },
	});
	if (vehicleEventConflict) {
		throw AppError.conflict('Vehicle is already in use');
	}
}

export async function assertEventCapacityFitsParticipants(
	tx: TransactionClient,
	eventId: string,
	capacity: number | null,
): Promise<void> {
	if (capacity == null) {
		return;
	}

	const participantCount = await tx.eventParticipant.count({
		where: { eventId },
	});
	if (capacity < participantCount) {
		throw AppError.conflict('Event capacity would be exceeded');
	}
}

async function assertExistingParticipantsHaveFreeWindow(
	tx: TransactionClient,
	params: {
		eventId: string;
		start: Date;
		end: Date;
	},
): Promise<void> {
	const existingParticipants = await tx.eventParticipant.findMany({
		where: { eventId: params.eventId },
		select: { studentId: true },
	});
	if (existingParticipants.length === 0) {
		return;
	}

	const conflicting =
		await findStudentProfileIdsWithScheduleConflictsForEventWindow(tx, {
			eventId: params.eventId,
			start: params.start,
			end: params.end,
			candidateProfileIds: existingParticipants.map((p) => p.studentId),
		});
	if (conflicting.size > 0) {
		throw AppError.conflict(
			'Time change conflicts with existing participant schedules',
		);
	}
}
