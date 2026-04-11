import { EventType, LessonStatus, LessonType, Role } from '@prisma/client';
import { AppError } from '../lib/http/AppError';
import { getPrisma } from '../lib/prisma';
import type {
	ScheduleManagerQuery,
	ScheduleMeQuery,
} from '../schemas/schedule.schemas';

const prisma = getPrisma();

export type ScheduleLessonItemDto = {
	kind: 'lesson';
	id: string;
	type: LessonType;
	status: string;
	startTime: string;
	endTime: string;
	instructor?: { id: string; firstName: string; lastName: string };
	student?: { id: string; firstName: string; lastName: string };
	vehicle?: { id: string; name: string; registrationNumber: string };
};

export type ScheduleInstructorEventItemDto = {
	kind: 'instructor_event';
	id: string;
	/** Enum Prisma `EventType` — blok instruktora (DRIVE / THEORY). */
	eventType: EventType;
	/** To samo co `eventType` (alias pod klientów oczekujące `eventKind`). */
	eventKind: EventType;
	/**
	 * Odpowiednik wizualny jak przy lekcji: THEORY → THEORY, DRIVE → PRACTICE
	 * (ułatwia jeden kod kalendarza dla lekcji i eventów).
	 */
	type: LessonType;
	/** Brak statusu w DB — stała dla kompatybilności z filtrem jak u lekcji. */
	status: 'SCHEDULED';
	startTime: string;
	endTime: string;
	capacity: number | null;
	participantCount: number;
	instructor?: { id: string; firstName: string; lastName: string };
	students?: { id: string; firstName: string; lastName: string }[];
	vehicle?: { id: string; name: string; registrationNumber: string };
};

export type ScheduleItemDto =
	| ScheduleLessonItemDto
	| ScheduleInstructorEventItemDto;

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

type EventRow = {
	id: string;
	type: EventType;
	startTime: Date;
	endTime: Date;
	capacity: number | null;
	instructor: {
		id: string;
		user: { firstName: string; lastName: string };
	};
	vehicle: {
		id: string;
		name: string;
		registrationNumber: string;
	} | null;
	participants: {
		student: {
			id: string;
			user: { firstName: string; lastName: string };
		};
	}[];
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

/** Instructor events overlapping [dateFrom, dateTo] (UTC calendar days). */
function buildEventDateRangeWhere(dateFrom: string, dateTo: string) {
	const rangeStart = new Date(`${dateFrom}T00:00:00.000Z`);
	const rangeEnd = new Date(`${dateTo}T23:59:59.999Z`);
	return {
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

const eventInclude = {
	instructor: {
		select: {
			id: true,
			user: { select: { firstName: true, lastName: true } },
		},
	},
	vehicle: {
		select: { id: true, name: true, registrationNumber: true },
	},
	participants: {
		select: {
			student: {
				select: {
					id: true,
					user: { select: { firstName: true, lastName: true } },
				},
			},
		},
	},
} as const;

function compareScheduleByStart(a: ScheduleItemDto, b: ScheduleItemDto) {
	const t1 = new Date(a.startTime).getTime();
	const t2 = new Date(b.startTime).getTime();
	return t1 - t2;
}

function mergeScheduleItems(
	lessonItems: ScheduleLessonItemDto[],
	eventItems: ScheduleInstructorEventItemDto[],
): ScheduleItemDto[] {
	return [...lessonItems, ...eventItems].sort(compareScheduleByStart);
}

function mapLesson(
	row: LessonRow,
	opts: { includeInstructor: boolean; includeStudent: boolean },
): ScheduleLessonItemDto {
	const item: ScheduleLessonItemDto = {
		kind: 'lesson',
		id: row.id,
		type: row.lessonType,
		status: row.status,
		startTime: row.startTime.toISOString(),
		endTime: row.endTime.toISOString(),
	};
	const includeInstructorEffective =
		opts.includeInstructor ||
		row.lessonType === LessonType.THEORY ||
		row.lessonType === LessonType.PRACTICE;
	if (includeInstructorEffective) {
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

function eventTypeToCalendarLessonType(et: EventType): LessonType {
	return et === EventType.THEORY ? LessonType.THEORY : LessonType.PRACTICE;
}

function sortParticipantsForSchedule(
	participants: EventRow['participants'],
): { id: string; firstName: string; lastName: string }[] {
	const mapped = participants.map((p) => ({
		id: p.student.id,
		firstName: p.student.user.firstName,
		lastName: p.student.user.lastName,
	}));
	return mapped.sort((a, b) => {
		const ln = a.lastName.localeCompare(b.lastName);
		if (ln !== 0) return ln;
		return a.firstName.localeCompare(b.firstName);
	});
}

function mapInstructorEvent(
	row: EventRow,
	opts: { includeInstructor: boolean; includeStudents: boolean },
): ScheduleInstructorEventItemDto {
	const item: ScheduleInstructorEventItemDto = {
		kind: 'instructor_event',
		id: row.id,
		eventType: row.type,
		eventKind: row.type,
		type: eventTypeToCalendarLessonType(row.type),
		status: 'SCHEDULED',
		startTime: row.startTime.toISOString(),
		endTime: row.endTime.toISOString(),
		capacity: row.capacity,
		participantCount: row.participants.length,
	};
	const includeInstructorEffective =
		opts.includeInstructor || row.type === EventType.THEORY;
	if (includeInstructorEffective) {
		item.instructor = {
			id: row.instructor.id,
			firstName: row.instructor.user.firstName,
			lastName: row.instructor.user.lastName,
		};
	}
	if (opts.includeStudents) {
		item.students = sortParticipantsForSchedule(row.participants);
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
		const eventWhere = buildEventDateRangeWhere(
			query.dateFrom,
			query.dateTo,
		);
		const [rows, eventRows] = await Promise.all([
			prisma.lesson.findMany({
				where: { ...where, instructorId: profile.id },
				include: lessonInclude,
				orderBy: { startTime: 'asc' },
			}),
			prisma.instructorEvent.findMany({
				where: { ...eventWhere, instructorId: profile.id },
				include: eventInclude,
				orderBy: { startTime: 'asc' },
			}),
		]);
		const lessonItems = rows.map((r) =>
			mapLesson(r as LessonRow, {
				includeInstructor: false,
				includeStudent: true,
			}),
		);
		const eventItems = eventRows.map((r) =>
			mapInstructorEvent(r as EventRow, {
				includeInstructor: false,
				includeStudents: true,
			}),
		);
		return { items: mergeScheduleItems(lessonItems, eventItems) };
	}

	if (actor.role === Role.STUDENT) {
		const profile = await prisma.studentProfile.findUnique({
			where: { userId: actor.id },
			select: { id: true },
		});
		if (!profile) {
			throw AppError.notFound('Student profile not found');
		}
		const eventWhere = buildEventDateRangeWhere(
			query.dateFrom,
			query.dateTo,
		);
		const [rows, eventRows] = await Promise.all([
			prisma.lesson.findMany({
				where: { ...where, studentId: profile.id },
				include: lessonInclude,
				orderBy: { startTime: 'asc' },
			}),
			prisma.instructorEvent.findMany({
				where: {
					...eventWhere,
					participants: { some: { studentId: profile.id } },
				},
				include: eventInclude,
				orderBy: { startTime: 'asc' },
			}),
		]);
		const lessonItems = rows.map((r) =>
			mapLesson(r as LessonRow, {
				includeInstructor: true,
				includeStudent: false,
			}),
		);
		const eventItems = eventRows.map((r) =>
			mapInstructorEvent(r as EventRow, {
				includeInstructor: true,
				includeStudents: false,
			}),
		);
		return { items: mergeScheduleItems(lessonItems, eventItems) };
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

	const eventWhere = buildEventDateRangeWhere(query.dateFrom, query.dateTo);

	if (query.instructorId) {
		const [rows, eventRows] = await Promise.all([
			prisma.lesson.findMany({
				where: { ...where, instructorId: query.instructorId },
				include: lessonInclude,
				orderBy: { startTime: 'asc' },
			}),
			prisma.instructorEvent.findMany({
				where: { ...eventWhere, instructorId: query.instructorId },
				include: eventInclude,
				orderBy: { startTime: 'asc' },
			}),
		]);
		const lessonItems = rows.map((r) =>
			mapLesson(r as LessonRow, {
				includeInstructor: false,
				includeStudent: true,
			}),
		);
		const eventItems = eventRows.map((r) =>
			mapInstructorEvent(r as EventRow, {
				includeInstructor: false,
				includeStudents: true,
			}),
		);
		return { items: mergeScheduleItems(lessonItems, eventItems) };
	}

	const [rows, eventRows] = await Promise.all([
		prisma.lesson.findMany({
			where: { ...where, studentId: query.studentId! },
			include: lessonInclude,
			orderBy: { startTime: 'asc' },
		}),
		prisma.instructorEvent.findMany({
			where: {
				...eventWhere,
				participants: { some: { studentId: query.studentId! } },
			},
			include: eventInclude,
			orderBy: { startTime: 'asc' },
		}),
	]);
	const lessonItems = rows.map((r) =>
		mapLesson(r as LessonRow, {
			includeInstructor: true,
			includeStudent: false,
		}),
	);
	const eventItems = eventRows.map((r) =>
		mapInstructorEvent(r as EventRow, {
			includeInstructor: true,
			includeStudents: false,
		}),
	);
	return { items: mergeScheduleItems(lessonItems, eventItems) };
}
