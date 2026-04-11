import { LessonStatus, LessonType, Role } from '@prisma/client';
import { AppError } from '../lib/http/AppError';
import { getPrisma } from '../lib/prisma';
import type {
	ScheduleManagerQuery,
	ScheduleMeQuery,
} from '../schemas/schedule.schemas';

const prisma = getPrisma();

export type ScheduleItemDto = {
	id: string;
	type: LessonType;
	status: string;
	startTime: string;
	endTime: string;
	instructor?: { id: string; firstName: string; lastName: string };
	student?: { id: string; firstName: string; lastName: string };
	vehicle?: { id: string; name: string; registrationNumber: string };
};

type LessonRow = {
	id: string;
	lessonType: LessonType;
	status: string;
	startTime: Date;
	endTime: Date;
	instructorProfile: {
		id: string;
		user: { firstName: string; lastName: string };
	};
	studentProfile: {
		id: string;
		user: { firstName: string; lastName: string };
	};
	vehicle: {
		id: string;
		name: string;
		registrationNumber: string;
	} | null;
};

/** Lessons overlapping [dateFrom, dateTo] (UTC calendar days), excluding cancelled. */
function buildDateRangeWhere(dateFrom: string, dateTo: string) {
	const rangeStart = new Date(`${dateFrom}T00:00:00.000Z`);
	const rangeEnd = new Date(`${dateTo}T23:59:59.999Z`);
	return {
		status: { not: LessonStatus.CANCELLED },
		startTime: { lt: rangeEnd },
		endTime: { gt: rangeStart },
	};
}

const lessonInclude = {
	instructorProfile: {
		select: {
			id: true,
			user: { select: { firstName: true, lastName: true } },
		},
	},
	studentProfile: {
		select: {
			id: true,
			user: { select: { firstName: true, lastName: true } },
		},
	},
	vehicle: {
		select: { id: true, name: true, registrationNumber: true },
	},
};

function mapLesson(
	row: LessonRow,
	opts: { includeInstructor: boolean; includeStudent: boolean },
): ScheduleItemDto {
	const item: ScheduleItemDto = {
		id: row.id,
		type: row.lessonType,
		status: row.status,
		startTime: row.startTime.toISOString(),
		endTime: row.endTime.toISOString(),
	};
	if (opts.includeInstructor) {
		item.instructor = {
			id: row.instructorProfile.id,
			firstName: row.instructorProfile.user.firstName,
			lastName: row.instructorProfile.user.lastName,
		};
	}
	if (opts.includeStudent) {
		item.student = {
			id: row.studentProfile.id,
			firstName: row.studentProfile.user.firstName,
			lastName: row.studentProfile.user.lastName,
		};
	}
	if (row.vehicle) {
		item.vehicle = {
			id: row.vehicle.id,
			name: row.vehicle.name,
			registrationNumber: row.vehicle.registrationNumber,
		};
	}
	return item;
}

export async function getMySchedule(
	actor: { id: string; role: Role },
	query: ScheduleMeQuery,
): Promise<{ items: ScheduleItemDto[] }> {
	if (actor.role === Role.MANAGER || actor.role === Role.ADMIN) {
		throw AppError.forbidden('Forbidden');
	}

	const where = buildDateRangeWhere(query.dateFrom, query.dateTo);

	if (actor.role === Role.INSTRUCTOR) {
		const profile = await prisma.instructorProfile.findUnique({
			where: { userId: actor.id },
			select: { id: true },
		});
		if (!profile) {
			throw AppError.notFound('Instructor profile not found');
		}
		const rows = await prisma.lesson.findMany({
			where: { ...where, instructorId: profile.id },
			include: lessonInclude,
			orderBy: { startTime: 'asc' },
		});
		return {
			items: rows.map((r) =>
				mapLesson(r as LessonRow, {
					includeInstructor: false,
					includeStudent: true,
				}),
			),
		};
	}

	if (actor.role === Role.STUDENT) {
		const profile = await prisma.studentProfile.findUnique({
			where: { userId: actor.id },
			select: { id: true },
		});
		if (!profile) {
			throw AppError.notFound('Student profile not found');
		}
		const rows = await prisma.lesson.findMany({
			where: { ...where, studentId: profile.id },
			include: lessonInclude,
			orderBy: { startTime: 'asc' },
		});
		return {
			items: rows.map((r) =>
				mapLesson(r as LessonRow, {
					includeInstructor: true,
					includeStudent: false,
				}),
			),
		};
	}

	throw AppError.forbidden('Forbidden');
}

export async function getScheduleForTarget(
	actor: { id: string; role: Role },
	query: ScheduleManagerQuery,
): Promise<{ items: ScheduleItemDto[] }> {
	if (actor.role !== Role.MANAGER && actor.role !== Role.ADMIN) {
		throw AppError.forbidden('Forbidden');
	}

	const where = buildDateRangeWhere(query.dateFrom, query.dateTo);

	if (query.instructorId) {
		const rows = await prisma.lesson.findMany({
			where: { ...where, instructorId: query.instructorId },
			include: lessonInclude,
			orderBy: { startTime: 'asc' },
		});
		return {
			items: rows.map((r) =>
				mapLesson(r as LessonRow, {
					includeInstructor: false,
					includeStudent: true,
				}),
			),
		};
	}

	const rows = await prisma.lesson.findMany({
		where: { ...where, studentId: query.studentId! },
		include: lessonInclude,
		orderBy: { startTime: 'asc' },
	});
	return {
		items: rows.map((r) =>
			mapLesson(r as LessonRow, {
				includeInstructor: true,
				includeStudent: false,
			}),
		),
	};
}
