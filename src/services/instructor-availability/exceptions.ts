import { Prisma } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import type { PutExceptionBody } from '../../schemas/instructor-availability.schemas';
import {
	assertActorCanManageAvailability,
	resolveActiveInstructorProfile,
} from './access';
import { dbTimeToHHmm, hhmmToDbTime, yyyymmddToDate } from './time';
import type { Actor, ExceptionEntryDto } from './types';

const prisma = getPrisma();

function formatExceptionDto(row: {
	id: string;
	date: Date;
	isDayOff: boolean;
	startTime: Date | null;
	endTime: Date | null;
}): ExceptionEntryDto {
	const y = row.date.getUTCFullYear();
	const mo = String(row.date.getUTCMonth() + 1).padStart(2, '0');
	const d = String(row.date.getUTCDate()).padStart(2, '0');
	return {
		id: row.id,
		date: `${y}-${mo}-${d}`,
		isDayOff: row.isDayOff,
		startTime: row.startTime ? dbTimeToHHmm(row.startTime) : null,
		endTime: row.endTime ? dbTimeToHHmm(row.endTime) : null,
	};
}

export async function listExceptions(
	actor: Actor,
	instructorId: string,
	from: string,
	to: string,
): Promise<ExceptionEntryDto[]> {
	await assertActorCanManageAvailability(actor, instructorId);
	await resolveActiveInstructorProfile(instructorId);

	const rows = await prisma.instructorWorkingHours.findMany({
		where: {
			instructorId,
			date: {
				gte: yyyymmddToDate(from),
				lte: yyyymmddToDate(to),
			},
		},
		orderBy: { date: 'asc' },
		select: {
			id: true,
			date: true,
			isDayOff: true,
			startTime: true,
			endTime: true,
		},
	});

	return rows.map(formatExceptionDto);
}

export async function upsertException(
	actor: Actor,
	instructorId: string,
	dateStr: string,
	body: PutExceptionBody,
): Promise<ExceptionEntryDto> {
	await assertActorCanManageAvailability(actor, instructorId);
	await resolveActiveInstructorProfile(instructorId);

	const date = yyyymmddToDate(dateStr);
	const startTime = body.startTime ? hhmmToDbTime(body.startTime) : null;
	const endTime = body.endTime ? hhmmToDbTime(body.endTime) : null;

	const data = {
		isDayOff: body.isDayOff,
		startTime,
		endTime,
	};

	let row: {
		id: string;
		date: Date;
		isDayOff: boolean;
		startTime: Date | null;
		endTime: Date | null;
	};

	try {
		row = await prisma.instructorWorkingHours.upsert({
			where: {
				uq_instructor_working_hours_instructor_id_date: {
					instructorId,
					date,
				},
			},
			create: { instructorId, date, ...data },
			update: data,
			select: {
				id: true,
				date: true,
				isDayOff: true,
				startTime: true,
				endTime: true,
			},
		});
	} catch (err) {
		if (
			err instanceof Prisma.PrismaClientKnownRequestError &&
			err.code === 'P2002'
		) {
			throw AppError.conflict('Exception for this date already exists');
		}
		throw err;
	}

	return formatExceptionDto(row);
}

export async function deleteException(
	actor: Actor,
	instructorId: string,
	dateStr: string,
): Promise<void> {
	await assertActorCanManageAvailability(actor, instructorId);
	await resolveActiveInstructorProfile(instructorId);

	const date = yyyymmddToDate(dateStr);

	const deleted = await prisma.instructorWorkingHours.deleteMany({
		where: { instructorId, date },
	});

	if (deleted.count === 0) throw AppError.notFound('Exception not found');
}
