import { LessonStatus, Prisma, PrismaClient, Role } from '@prisma/client';
import { AppError } from '../lib/http/AppError';
import { getPrisma } from '../lib/prisma';
import type {
	PutExceptionBody,
	PutWeeklyBody,
} from '../schemas/instructor-availability.schemas';

const prisma = getPrisma();

/** Prisma client or interactive transaction client for availability reads. */
export type AvailabilityDbClient = PrismaClient | Prisma.TransactionClient;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Converts HH:mm string to minutes since midnight. */
function timeToMinutes(hhmm: string): number {
	const [h, m] = hhmm.split(':').map(Number);
	return (h ?? 0) * 60 + (m ?? 0);
}

/** Converts a @db.Time DateTime (1970-01-01THH:mm:ss.000Z) to HH:mm string. */
function dbTimeToHHmm(date: Date): string {
	const h = String(date.getUTCHours()).padStart(2, '0');
	const m = String(date.getUTCMinutes()).padStart(2, '0');
	return `${h}:${m}`;
}

/** Converts HH:mm string to Date object suitable for @db.Time. */
function hhmmToDbTime(hhmm: string): Date {
	const [h, m] = hhmm.split(':').map(Number);
	const d = new Date(0);
	d.setUTCHours(h ?? 0, m ?? 0, 0, 0);
	return d;
}

/** Converts YYYY-MM-DD string to Date object suitable for @db.Date. */
function yyyymmddToDate(dateStr: string): Date {
	const [y, mo, d] = dateStr.split('-').map(Number);
	return new Date(Date.UTC(y ?? 0, (mo ?? 1) - 1, d ?? 1));
}

type Actor = { id: string; role: Role };

/**
 * Asserts the actor can read/write availability for the given instructor.
 * ADMIN → always. MANAGER → must own a school linked to the instructor.
 */
export async function assertActorCanManageAvailability(
	actor: Actor,
	instructorId: string,
): Promise<void> {
	if (actor.role === Role.ADMIN) return;
	if (actor.role !== Role.MANAGER) throw AppError.forbidden('Forbidden');

	const link = await prisma.instructorSchool.findFirst({
		where: {
			instructorId,
			school: { ownerId: actor.id, deletedAt: null },
		},
		select: { id: true },
	});

	if (!link) throw AppError.forbidden('Forbidden');
}

/** Resolves the instructor profile id and checks it exists and is active. */
export async function resolveActiveInstructorProfile(
	instructorId: string,
): Promise<string> {
	const profile = await prisma.instructorProfile.findFirst({
		where: {
			id: instructorId,
			user: { deletedAt: null, isActive: true, role: Role.INSTRUCTOR },
		},
		select: { id: true },
	});

	if (!profile) throw AppError.notFound('Instructor not found');
	return profile.id;
}

// ── Weekly availability ───────────────────────────────────────────────────────

export type WeeklyEntryDto = {
	id: string;
	dayOfWeek: number;
	startTime: string;
	endTime: string;
};

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

// ── Exceptions ────────────────────────────────────────────────────────────────

export type ExceptionEntryDto = {
	id: string;
	date: string;
	isDayOff: boolean;
	startTime: string | null;
	endTime: string | null;
};

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

// ── Compute availability ──────────────────────────────────────────────────────

type TimeWindow = { start: number; end: number }; // minutes since midnight

/** Subtracts a list of used windows from a base window, returning free fragments. */
function subtractWindows(base: TimeWindow, used: TimeWindow[]): TimeWindow[] {
	const sorted = [...used].sort((a, b) => a.start - b.start);
	const free: TimeWindow[] = [];
	let cursor = base.start;

	for (const block of sorted) {
		if (block.start >= base.end) break;
		const blockStart = Math.max(block.start, base.start);
		const blockEnd = Math.min(block.end, base.end);
		if (blockStart > cursor) {
			free.push({ start: cursor, end: blockStart });
		}
		cursor = Math.max(cursor, blockEnd);
	}

	if (cursor < base.end) {
		free.push({ start: cursor, end: base.end });
	}

	return free;
}

function minutesToHHmm(minutes: number): string {
	const h = String(Math.floor(minutes / 60)).padStart(2, '0');
	const m = String(minutes % 60).padStart(2, '0');
	return `${h}:${m}`;
}

export type AvailabilityWindow = { start: string; end: string };

export type ComputedAvailability =
	| { available: false; reason: 'leave' | 'day_off' | 'no_schedule' }
	| { available: true; windows: AvailabilityWindow[] };

export async function computeAvailability(
	actor: Actor,
	instructorId: string,
	dateStr: string,
): Promise<ComputedAvailability> {
	await assertActorCanManageAvailability(actor, instructorId);
	await resolveActiveInstructorProfile(instructorId);

	const date = yyyymmddToDate(dateStr);

	// 1. Check leaves
	const leave = await prisma.instructorLeave.findFirst({
		where: {
			instructorId,
			startDate: { lte: date },
			endDate: { gte: date },
		},
		select: { id: true },
	});

	if (leave) return { available: false, reason: 'leave' };

	// 2. Check exception for this specific date
	const exception = await prisma.instructorWorkingHours.findUnique({
		where: {
			uq_instructor_working_hours_instructor_id_date: {
				instructorId,
				date,
			},
		},
		select: { isDayOff: true, startTime: true, endTime: true },
	});

	let baseWindow: TimeWindow | null = null;

	if (exception) {
		if (exception.isDayOff) return { available: false, reason: 'day_off' };
		// isDayOff = false → startTime and endTime guaranteed (validated on save)
		baseWindow = {
			start: timeToMinutes(dbTimeToHHmm(exception.startTime!)),
			end: timeToMinutes(dbTimeToHHmm(exception.endTime!)),
		};
	} else {
		// 3. Fall back to weekly default
		const dayOfWeek = date.getUTCDay();
		const weekly = await prisma.instructorWorkingHoursDefault.findUnique({
			where: {
				uq_instructor_working_hours_default_instructor_id_day_of_week: {
					instructorId,
					dayOfWeek,
				},
			},
			select: { startTime: true, endTime: true },
		});

		if (!weekly) return { available: false, reason: 'no_schedule' };

		baseWindow = {
			start: timeToMinutes(dbTimeToHHmm(weekly.startTime)),
			end: timeToMinutes(dbTimeToHHmm(weekly.endTime)),
		};
	}

	// 4. Build list of used windows from TimeBlocks and Lessons
	const dayStart = date;
	const dayEnd = new Date(
		Date.UTC(
			date.getUTCFullYear(),
			date.getUTCMonth(),
			date.getUTCDate() + 1,
		),
	);

	const [timeBlocks, lessons, instructorEvents] = await Promise.all([
		prisma.instructorTimeBlock.findMany({
			where: {
				instructorId,
				startTime: { gte: dayStart, lt: dayEnd },
			},
			select: { startTime: true, endTime: true },
		}),
		prisma.lesson.findMany({
			where: {
				instructorId,
				startTime: { gte: dayStart, lt: dayEnd },
				status: { not: LessonStatus.CANCELLED },
			},
			select: { startTime: true, endTime: true },
		}),
		prisma.instructorEvent.findMany({
			where: {
				instructorId,
				startTime: { gte: dayStart, lt: dayEnd },
			},
			select: { startTime: true, endTime: true },
		}),
	]);

	const usedWindows: TimeWindow[] = [
		...timeBlocks.map((b) => ({
			start: b.startTime.getUTCHours() * 60 + b.startTime.getUTCMinutes(),
			end: b.endTime.getUTCHours() * 60 + b.endTime.getUTCMinutes(),
		})),
		...lessons.map((l) => ({
			start: l.startTime.getUTCHours() * 60 + l.startTime.getUTCMinutes(),
			end: l.endTime.getUTCHours() * 60 + l.endTime.getUTCMinutes(),
		})),
		...instructorEvents.map((e) => ({
			start: e.startTime.getUTCHours() * 60 + e.startTime.getUTCMinutes(),
			end: e.endTime.getUTCHours() * 60 + e.endTime.getUTCMinutes(),
		})),
	];

	// 5. Subtract used windows from base window
	const freeWindows = subtractWindows(baseWindow, usedWindows);

	return {
		available: true,
		windows: freeWindows.map((w) => ({
			start: minutesToHHmm(w.start),
			end: minutesToHHmm(w.end),
		})),
	};
}

// ── Slots (range) ─────────────────────────────────────────────────────────────

const SLOT_DURATION_MINUTES = 60;

export type SlotDto = {
	date: string;
	startTime: string;
	endTime: string;
};

function dateToYYYYMMDD(date: Date): string {
	const y = date.getUTCFullYear();
	const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
	const d = String(date.getUTCDate()).padStart(2, '0');
	return `${y}-${mo}-${d}`;
}

function splitWindowIntoSlots(
	window: TimeWindow,
	slotDurationMinutes: number,
): TimeWindow[] {
	const slots: TimeWindow[] = [];
	let cursor = window.start;

	while (cursor + slotDurationMinutes <= window.end) {
		slots.push({ start: cursor, end: cursor + slotDurationMinutes });
		cursor += slotDurationMinutes;
	}

	return slots;
}

/**
 * Free time windows for one UTC calendar day (leave / day off / no weekly → null).
 */
export async function computeDayWindows(
	instructorId: string,
	date: Date,
	db: AvailabilityDbClient = prisma,
	excludeEventId?: string,
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

	let baseWindow: TimeWindow | null = null;

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
	const dayEnd = new Date(
		Date.UTC(
			date.getUTCFullYear(),
			date.getUTCMonth(),
			date.getUTCDate() + 1,
		),
	);

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
			},
			select: { startTime: true, endTime: true },
		}),
		db.instructorEvent.findMany({
			where: {
				instructorId,
				startTime: { gte: dayStart, lt: dayEnd },
				...(excludeEventId ? { id: { not: excludeEventId } } : {}),
			},
			select: { startTime: true, endTime: true },
		}),
	]);

	const usedWindows: TimeWindow[] = [
		...timeBlocks.map((b) => ({
			start: b.startTime.getUTCHours() * 60 + b.startTime.getUTCMinutes(),
			end: b.endTime.getUTCHours() * 60 + b.endTime.getUTCMinutes(),
		})),
		...lessons.map((l) => ({
			start: l.startTime.getUTCHours() * 60 + l.startTime.getUTCMinutes(),
			end: l.endTime.getUTCHours() * 60 + l.endTime.getUTCMinutes(),
		})),
		...instructorEvents.map((e) => ({
			start: e.startTime.getUTCHours() * 60 + e.startTime.getUTCMinutes(),
			end: e.endTime.getUTCHours() * 60 + e.endTime.getUTCMinutes(),
		})),
	];

	return subtractWindows(baseWindow, usedWindows);
}

/**
 * Ensures [startTime, endTime] lies fully inside one free window on that UTC day.
 */
export async function assertInstructorTimeWindowAvailable(
	instructorId: string,
	startTime: Date,
	endTime: Date,
	db: AvailabilityDbClient = prisma,
	excludeEventId?: string,
): Promise<void> {
	if (startTime.getTime() >= endTime.getTime()) {
		throw AppError.badRequest('startTime must be before endTime');
	}
	const sameDay =
		startTime.getUTCFullYear() === endTime.getUTCFullYear() &&
		startTime.getUTCMonth() === endTime.getUTCMonth() &&
		startTime.getUTCDate() === endTime.getUTCDate();
	if (!sameDay) {
		throw AppError.badRequest(
			'Event must start and end on the same UTC calendar day',
		);
	}
	const date = new Date(
		Date.UTC(
			startTime.getUTCFullYear(),
			startTime.getUTCMonth(),
			startTime.getUTCDate(),
		),
	);
	const free = await computeDayWindows(
		instructorId,
		date,
		db,
		excludeEventId,
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

/**
 * Generates slots for an instructor in [dateFrom, dateTo] (inclusive) without auth checks.
 * Caller must ensure the instructor exists and is eligible (e.g. active profile).
 */
export async function generateSlotsInternal(
	instructorId: string,
	dateFrom: string,
	dateTo: string,
	slotDurationMinutes: number,
): Promise<SlotDto[]> {
	const from = yyyymmddToDate(dateFrom);
	const to = yyyymmddToDate(dateTo);
	const slots: SlotDto[] = [];

	const current = new Date(from);
	while (current.getTime() <= to.getTime()) {
		const freeWindows = await computeDayWindows(instructorId, current);
		const dateStr = dateToYYYYMMDD(current);

		if (freeWindows !== null) {
			for (const window of freeWindows) {
				const daySlots = splitWindowIntoSlots(
					window,
					slotDurationMinutes,
				);
				for (const slot of daySlots) {
					slots.push({
						date: dateStr,
						startTime: minutesToHHmm(slot.start),
						endTime: minutesToHHmm(slot.end),
					});
				}
			}
		}

		current.setUTCDate(current.getUTCDate() + 1);
	}

	return slots;
}

export async function generateSlots(
	actor: Actor,
	instructorId: string,
	dateFrom: string,
	dateTo: string,
): Promise<SlotDto[]> {
	await assertActorCanManageAvailability(actor, instructorId);
	await resolveActiveInstructorProfile(instructorId);
	return generateSlotsInternal(
		instructorId,
		dateFrom,
		dateTo,
		SLOT_DURATION_MINUTES,
	);
}
