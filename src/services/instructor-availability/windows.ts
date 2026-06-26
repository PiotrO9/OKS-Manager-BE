import { LessonStatus } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import {
	assertActorCanManageAvailability,
	resolveActiveInstructorProfile,
} from './access';
import {
	datesAreSameUtcDay,
	dbTimeToHHmm,
	minutesToHHmm,
	nextUtcDay,
	subtractWindows,
	timeToMinutes,
	timeWindowFromDates,
	utcDateOnly,
	yyyymmddToDate,
	type TimeWindow,
} from './time';
import type {
	Actor,
	AvailabilityDbClient,
	AvailabilityWindow,
	ComputedAvailability,
} from './types';

const prisma = getPrisma();

export type { AvailabilityWindow, ComputedAvailability };

export async function computeAvailability(
	actor: Actor,
	instructorId: string,
	dateStr: string,
): Promise<ComputedAvailability> {
	await assertActorCanManageAvailability(actor, instructorId);
	await resolveActiveInstructorProfile(instructorId);

	const date = yyyymmddToDate(dateStr);
	const freeWindows = await computeDayWindows(instructorId, date);

	if (freeWindows === null) {
		const reason = await resolveUnavailableReason(instructorId, date);
		return { available: false, reason };
	}

	return {
		available: true,
		windows: freeWindows.map((w) => ({
			start: minutesToHHmm(w.start),
			end: minutesToHHmm(w.end),
		})),
	};
}

async function resolveUnavailableReason(
	instructorId: string,
	date: Date,
): Promise<'leave' | 'day_off' | 'no_schedule'> {
	const leave = await prisma.instructorLeave.findFirst({
		where: {
			instructorId,
			startDate: { lte: date },
			endDate: { gte: date },
		},
		select: { id: true },
	});

	if (leave) return 'leave';

	const exception = await prisma.instructorWorkingHours.findUnique({
		where: {
			uq_instructor_working_hours_instructor_id_date: {
				instructorId,
				date,
			},
		},
		select: { isDayOff: true },
	});

	if (exception?.isDayOff) return 'day_off';

	return 'no_schedule';
}

export async function computeDayWindows(
	instructorId: string,
	date: Date,
	db: AvailabilityDbClient = prisma,
	excludeEventId?: string,
	excludeLessonId?: string,
): Promise<TimeWindow[] | null> {
	const leave = await db.instructorLeave.findFirst({
		where: {
			instructorId,
			startDate: { lte: date },
			endDate: { gte: date },
		},
		select: { id: true },
	});

	if (leave) return null;

	const exception = await db.instructorWorkingHours.findUnique({
		where: {
			uq_instructor_working_hours_instructor_id_date: {
				instructorId,
				date,
			},
		},
		select: { isDayOff: true, startTime: true, endTime: true },
	});

	let baseWindow: TimeWindow;

	if (exception) {
		if (exception.isDayOff) return null;
		baseWindow = {
			start: timeToMinutes(dbTimeToHHmm(exception.startTime!)),
			end: timeToMinutes(dbTimeToHHmm(exception.endTime!)),
		};
	} else {
		const dayOfWeek = date.getUTCDay();
		const weekly = await db.instructorWorkingHoursDefault.findUnique({
			where: {
				uq_instructor_working_hours_default_instructor_id_day_of_week: {
					instructorId,
					dayOfWeek,
				},
			},
			select: { startTime: true, endTime: true },
		});

		if (!weekly) return null;

		baseWindow = {
			start: timeToMinutes(dbTimeToHHmm(weekly.startTime)),
			end: timeToMinutes(dbTimeToHHmm(weekly.endTime)),
		};
	}

	const dayStart = date;
	const dayEnd = nextUtcDay(date);

	const [timeBlocks, lessons, instructorEvents] = await Promise.all([
		db.instructorTimeBlock.findMany({
			where: {
				instructorId,
				startTime: { gte: dayStart, lt: dayEnd },
			},
			select: { startTime: true, endTime: true },
		}),
		db.lesson.findMany({
			where: {
				instructorId,
				startTime: { gte: dayStart, lt: dayEnd },
				status: { not: LessonStatus.CANCELLED },
				...(excludeLessonId ? { id: { not: excludeLessonId } } : {}),
			},
			select: { startTime: true, endTime: true },
		}),
		db.instructorEvent.findMany({
			where: {
				instructorId,
				isActive: true,
				startTime: { gte: dayStart, lt: dayEnd },
				...(excludeEventId ? { id: { not: excludeEventId } } : {}),
			},
			select: { startTime: true, endTime: true },
		}),
	]);

	const usedWindows: TimeWindow[] = [
		...timeBlocks.map(timeWindowFromDates),
		...lessons.map(timeWindowFromDates),
		...instructorEvents.map(timeWindowFromDates),
	];

	return subtractWindows(baseWindow, usedWindows);
}

export async function assertInstructorTimeWindowAvailable(
	instructorId: string,
	startTime: Date,
	endTime: Date,
	db: AvailabilityDbClient = prisma,
	excludeEventId?: string,
	excludeLessonId?: string,
): Promise<void> {
	if (startTime.getTime() >= endTime.getTime()) {
		throw AppError.badRequest('startTime must be before endTime');
	}
	if (!datesAreSameUtcDay(startTime, endTime)) {
		throw AppError.badRequest(
			'Event must start and end on the same UTC calendar day',
		);
	}
	const free = await computeDayWindows(
		instructorId,
		utcDateOnly(startTime),
		db,
		excludeEventId,
		excludeLessonId,
	);
	if (free === null) {
		throw AppError.conflict('Slot outside instructor availability');
	}
	const reqStart = startTime.getUTCHours() * 60 + startTime.getUTCMinutes();
	const reqEnd = endTime.getUTCHours() * 60 + endTime.getUTCMinutes();
	const ok = free.some((w) => reqStart >= w.start && reqEnd <= w.end);
	if (!ok) {
		throw AppError.conflict('Slot outside instructor availability');
	}
}
