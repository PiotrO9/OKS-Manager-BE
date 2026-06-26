import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import type { PutWeeklyBody } from '../../schemas/instructor-availability.schemas';
import {
	assertActorCanManageAvailability,
	resolveActiveInstructorProfile,
} from './access';
import { dbTimeToHHmm, hhmmToDbTime } from './time';
import type { Actor, WeeklyEntryDto } from './types';

const prisma = getPrisma();

export async function getWeeklyAvailability(
	actor: Actor,
	instructorId: string,
): Promise<WeeklyEntryDto[]> {
	await assertActorCanManageAvailability(actor, instructorId);
	await resolveActiveInstructorProfile(instructorId);

	const rows = await prisma.instructorWorkingHoursDefault.findMany({
		where: { instructorId },
		orderBy: { dayOfWeek: 'asc' },
		select: { id: true, dayOfWeek: true, startTime: true, endTime: true },
	});

	return rows.map((row) => ({
		id: row.id,
		dayOfWeek: row.dayOfWeek,
		startTime: dbTimeToHHmm(row.startTime),
		endTime: dbTimeToHHmm(row.endTime),
	}));
}

export async function upsertWeeklyDay(
	actor: Actor,
	instructorId: string,
	dayOfWeek: number,
	body: PutWeeklyBody,
): Promise<WeeklyEntryDto> {
	await assertActorCanManageAvailability(actor, instructorId);
	await resolveActiveInstructorProfile(instructorId);

	const startTime = hhmmToDbTime(body.startTime);
	const endTime = hhmmToDbTime(body.endTime);

	const row = await prisma.instructorWorkingHoursDefault.upsert({
		where: {
			uq_instructor_working_hours_default_instructor_id_day_of_week: {
				instructorId,
				dayOfWeek,
			},
		},
		create: { instructorId, dayOfWeek, startTime, endTime },
		update: { startTime, endTime },
		select: { id: true, dayOfWeek: true, startTime: true, endTime: true },
	});

	return {
		id: row.id,
		dayOfWeek: row.dayOfWeek,
		startTime: dbTimeToHHmm(row.startTime),
		endTime: dbTimeToHHmm(row.endTime),
	};
}

export async function deleteWeeklyDay(
	actor: Actor,
	instructorId: string,
	dayOfWeek: number,
): Promise<void> {
	await assertActorCanManageAvailability(actor, instructorId);
	await resolveActiveInstructorProfile(instructorId);

	const deleted = await prisma.instructorWorkingHoursDefault.deleteMany({
		where: { instructorId, dayOfWeek },
	});

	if (deleted.count === 0)
		throw AppError.notFound('Schedule entry not found');
}
