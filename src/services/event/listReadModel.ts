import { Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import type { ListEventsQuery } from '../../schemas/event.schemas';
import { assertActorCanManageAvailability } from '../instructor-availability.service';
import type { InstructorEventListItemDto } from './mappers';
import { buildInstructorEventDateOverlapWhere } from './readModelDate';

const prisma = getPrisma();

type Actor = { id: string; role: Role };

type InstructorEventListRow = {
	id: string;
	type: InstructorEventListItemDto['type'];
	status: InstructorEventListItemDto['status'];
	instructorId: string;
	courseId: string | null;
	startTime: Date;
	endTime: Date;
	vehicleId: string | null;
	capacity: number | null;
	createdAt: Date;
	_count: { participants: number };
};

function mapInstructorEventListItem(
	row: InstructorEventListRow,
): InstructorEventListItemDto {
	return {
		id: row.id,
		type: row.type,
		status: row.status,
		instructorId: row.instructorId,
		courseId: row.courseId,
		startTime: row.startTime.toISOString(),
		endTime: row.endTime.toISOString(),
		vehicleId: row.vehicleId,
		capacity: row.capacity,
		participantCount: row._count.participants,
		createdAt: row.createdAt.toISOString(),
	};
}

const instructorEventListSelect = {
	id: true,
	type: true,
	status: true,
	instructorId: true,
	courseId: true,
	startTime: true,
	endTime: true,
	vehicleId: true,
	capacity: true,
	createdAt: true,
	_count: { select: { participants: true } },
} as const;

export async function listInstructorEvents(
	actor: Actor,
	query: ListEventsQuery,
): Promise<{ events: InstructorEventListItemDto[] }> {
	if (actor.role === Role.STUDENT) {
		throw AppError.forbidden('Forbidden');
	}

	const overlap = buildInstructorEventDateOverlapWhere(
		query.dateFrom,
		query.dateTo,
	);
	const statusFilter =
		query.status && query.status.length > 0
			? { status: { in: query.status } as const }
			: {};

	if (query.instructorId !== undefined && actor.role === Role.INSTRUCTOR) {
		throw AppError.unprocessableEntity(
			'instructorId filter is not available for instructor role',
		);
	}

	if (actor.role === Role.INSTRUCTOR) {
		const profile = await prisma.instructorProfile.findUnique({
			where: { userId: actor.id },
			select: { id: true },
		});
		if (!profile) {
			throw AppError.notFound('Instructor profile not found');
		}
		const rows = await prisma.instructorEvent.findMany({
			where: {
				isActive: true,
				...overlap,
				...statusFilter,
				instructorId: profile.id,
			},
			select: instructorEventListSelect,
			orderBy: { startTime: 'asc' },
		});
		return { events: rows.map(mapInstructorEventListItem) };
	}

	if (actor.role === Role.MANAGER) {
		if (query.instructorId !== undefined) {
			await assertActorCanManageAvailability(actor, query.instructorId);
		}
		const rows = await prisma.instructorEvent.findMany({
			where: {
				isActive: true,
				...overlap,
				...statusFilter,
				...(query.instructorId !== undefined
					? { instructorId: query.instructorId }
					: {}),
				instructor: {
					instructorSchools: {
						some: {
							school: { ownerId: actor.id, deletedAt: null },
						},
					},
				},
			},
			select: instructorEventListSelect,
			orderBy: { startTime: 'asc' },
		});
		return { events: rows.map(mapInstructorEventListItem) };
	}

	if (actor.role === Role.ADMIN) {
		const rows = await prisma.instructorEvent.findMany({
			where: {
				isActive: true,
				...overlap,
				...statusFilter,
				...(query.instructorId !== undefined
					? { instructorId: query.instructorId }
					: {}),
			},
			select: instructorEventListSelect,
			orderBy: { startTime: 'asc' },
		});
		return { events: rows.map(mapInstructorEventListItem) };
	}

	throw AppError.forbidden('Forbidden');
}
