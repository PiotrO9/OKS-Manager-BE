import { LessonStatus, Role } from '@prisma/client';
import { AppError } from '../lib/http/AppError';
import { filterInstructorIdsQualifiedForCourseType } from '../lib/instructorCourseQualification';
import { getPrisma } from '../lib/prisma';
import type { SchoolAvailabilitySlotsQuery } from '../schemas/school-availability.schemas';
import { generateSlotsInternal } from './instructor-availability.service';

const prisma = getPrisma();

type Actor = { id: string; role: Role };

export type SchoolSlotItemDto = {
	instructorId: string;
	instructorFirstName: string;
	instructorLastName: string;
	date: string;
	startTime: string;
	endTime: string;
};

export type ListSchoolSlotsResult = {
	slots: SchoolSlotItemDto[];
	total: number;
};

function yyyymmddToDate(dateStr: string): Date {
	const [y, mo, d] = dateStr.split('-').map(Number);
	return new Date(Date.UTC(y ?? 0, (mo ?? 1) - 1, d ?? 1));
}

function formatYYYYMMDD(date: Date): string {
	const y = date.getUTCFullYear();
	const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
	const d = String(date.getUTCDate()).padStart(2, '0');
	return `${y}-${mo}-${d}`;
}

function utcTodayYyyymmdd(): string {
	return formatYYYYMMDD(new Date());
}

function timeToMinutes(hhmm: string): number {
	const [h, m] = hhmm.split(':').map(Number);
	return (h ?? 0) * 60 + (m ?? 0);
}

function addDaysYyyymmdd(dateStr: string, days: number): string {
	const d = yyyymmddToDate(dateStr);
	d.setUTCDate(d.getUTCDate() + days);
	return formatYYYYMMDD(d);
}

function compareYyyymmdd(a: string, b: string): number {
	if (a < b) {
		return -1;
	}
	if (a > b) {
		return 1;
	}
	return 0;
}

function slotOverlapsLesson(
	slotDate: string,
	slotStartMin: number,
	slotEndMin: number,
	lessonDate: string,
	lessonStartMin: number,
	lessonEndMin: number,
): boolean {
	if (slotDate !== lessonDate) {
		return false;
	}
	return !(slotEndMin <= lessonStartMin || slotStartMin >= lessonEndMin);
}

async function loadSchoolAndAssertSlotAccess(
	actor: Actor,
	schoolId: string,
): Promise<{
	id: string;
	slotDurationMinutes: number;
	bookingMaxDaysAhead: number;
}> {
	const school = await prisma.drivingSchool.findFirst({
		where: { id: schoolId, deletedAt: null },
		select: {
			id: true,
			ownerId: true,
			settings: {
				select: {
					slotDurationMinutes: true,
					bookingMaxDaysAhead: true,
				},
			},
		},
	});

	if (!school) {
		throw AppError.notFound('Driving school not found');
	}

	switch (actor.role) {
		case Role.ADMIN:
			break;
		case Role.MANAGER:
			if (school.ownerId !== actor.id) {
				throw AppError.forbidden('Forbidden');
			}
			break;
		case Role.STUDENT: {
			const link = await prisma.studentSchool.findFirst({
				where: {
					schoolId: school.id,
					student: { userId: actor.id },
				},
				select: { id: true },
			});
			if (!link) {
				throw AppError.forbidden('Forbidden');
			}
			break;
		}
		case Role.INSTRUCTOR: {
			const link = await prisma.instructorSchool.findFirst({
				where: {
					schoolId: school.id,
					instructor: { userId: actor.id },
				},
				select: { id: true },
			});
			if (!link) {
				throw AppError.forbidden('Forbidden');
			}
			break;
		}
		default:
			throw AppError.forbidden('Forbidden');
	}

	const slotDurationMinutes = school.settings?.slotDurationMinutes ?? 60;
	const bookingMaxDaysAhead = school.settings?.bookingMaxDaysAhead ?? 30;

	return {
		id: school.id,
		slotDurationMinutes,
		bookingMaxDaysAhead,
	};
}

export async function listSchoolAvailabilitySlots(
	actor: Actor,
	schoolId: string,
	query: SchoolAvailabilitySlotsQuery,
): Promise<ListSchoolSlotsResult> {
	const school = await loadSchoolAndAssertSlotAccess(actor, schoolId);

	let effectiveDateFrom = query.dateFrom;
	const effectiveDateToInput = query.dateTo;

	if (actor.role === Role.STUDENT) {
		const today = utcTodayYyyymmdd();
		if (compareYyyymmdd(effectiveDateFrom, today) < 0) {
			effectiveDateFrom = today;
		}
	}

	const today = utcTodayYyyymmdd();
	const maxBookable = addDaysYyyymmdd(today, school.bookingMaxDaysAhead);
	let effectiveDateTo = effectiveDateToInput;
	if (compareYyyymmdd(effectiveDateTo, maxBookable) > 0) {
		effectiveDateTo = maxBookable;
	}

	if (compareYyyymmdd(effectiveDateFrom, effectiveDateTo) > 0) {
		return { slots: [], total: 0 };
	}

	const slotDurationMinutes =
		query.slotDurationMinutes ?? school.slotDurationMinutes;

	const rows = await prisma.instructorSchool.findMany({
		where: {
			schoolId: school.id,
			instructor: {
				user: {
					deletedAt: null,
					isActive: true,
					role: Role.INSTRUCTOR,
				},
			},
		},
		select: {
			instructor: {
				select: {
					id: true,
					user: {
						select: { firstName: true, lastName: true },
					},
				},
			},
		},
		orderBy: {
			instructor: { createdAt: 'asc' },
		},
	});

	const metaById = new Map<string, { firstName: string; lastName: string }>();
	let instructorIds = rows.map((r) => {
		const id = r.instructor.id;
		metaById.set(id, {
			firstName: r.instructor.user.firstName,
			lastName: r.instructor.user.lastName,
		});
		return id;
	});

	if (query.instructorIds?.length) {
		const allowed = new Set(instructorIds);
		for (const id of query.instructorIds) {
			if (!allowed.has(id)) {
				throw AppError.badRequest('Invalid instructorIds');
			}
		}
		instructorIds = query.instructorIds;
	}

	if (query.courseId) {
		const course = await prisma.course.findFirst({
			where: {
				id: query.courseId,
				schoolId: school.id,
				deletedAt: null,
			},
			select: { instructorId: true, courseTypeId: true },
		});

		if (!course) {
			throw AppError.notFound('Course not found');
		}

		if (actor.role === Role.STUDENT) {
			const participant = await prisma.courseParticipant.findFirst({
				where: {
					courseId: query.courseId,
					student: { userId: actor.id },
				},
				select: { id: true },
			});
			if (!participant) {
				throw AppError.forbidden('Forbidden');
			}
		}

		if (course.instructorId) {
			instructorIds = instructorIds.filter(
				(id) => id === course.instructorId,
			);
		}
		instructorIds = await filterInstructorIdsQualifiedForCourseType(
			instructorIds,
			course.courseTypeId,
		);
	}

	const excludeMyLessons =
		query.excludeMyLessons ?? (actor.role === Role.STUDENT ? true : false);

	type Busy = {
		date: string;
		startMin: number;
		endMin: number;
	};
	let busyIntervals: Busy[] = [];

	if (excludeMyLessons && actor.role === Role.STUDENT) {
		const profile = await prisma.studentProfile.findUnique({
			where: { userId: actor.id },
			select: { id: true },
		});
		if (profile) {
			const rangeStart = yyyymmddToDate(effectiveDateFrom);
			const rangeEndExclusive = yyyymmddToDate(effectiveDateTo);
			rangeEndExclusive.setUTCDate(rangeEndExclusive.getUTCDate() + 1);

			const lessons = await prisma.lesson.findMany({
				where: {
					studentId: profile.id,
					status: { not: LessonStatus.CANCELLED },
					startTime: { gte: rangeStart, lt: rangeEndExclusive },
				},
				select: { startTime: true, endTime: true },
			});

			busyIntervals = lessons.map((l) => ({
				date: formatYYYYMMDD(l.startTime),
				startMin:
					l.startTime.getUTCHours() * 60 +
					l.startTime.getUTCMinutes(),
				endMin:
					l.endTime.getUTCHours() * 60 + l.endTime.getUTCMinutes(),
			}));
		}
	}

	const timeFromMin = query.timeFrom ? timeToMinutes(query.timeFrom) : null;
	const timeToMin = query.timeTo ? timeToMinutes(query.timeTo) : null;
	const weekdaySet =
		query.weekdays && query.weekdays.length > 0
			? new Set(query.weekdays)
			: null;

	const all: SchoolSlotItemDto[] = [];

	for (const instructorId of instructorIds) {
		const rawSlots = await generateSlotsInternal(
			instructorId,
			effectiveDateFrom,
			effectiveDateTo,
			slotDurationMinutes,
		);
		const meta = metaById.get(instructorId);
		if (!meta) {
			continue;
		}

		for (const s of rawSlots) {
			const day = yyyymmddToDate(s.date);
			const dow = day.getUTCDay();
			if (weekdaySet && !weekdaySet.has(dow)) {
				continue;
			}

			const slotStartMin = timeToMinutes(s.startTime);
			const slotEndMin = timeToMinutes(s.endTime);

			if (timeFromMin !== null && slotStartMin < timeFromMin) {
				continue;
			}
			if (timeToMin !== null && slotEndMin > timeToMin) {
				continue;
			}

			let blockedByStudent = false;
			for (const b of busyIntervals) {
				if (
					slotOverlapsLesson(
						s.date,
						slotStartMin,
						slotEndMin,
						b.date,
						b.startMin,
						b.endMin,
					)
				) {
					blockedByStudent = true;
					break;
				}
			}
			if (blockedByStudent) {
				continue;
			}

			all.push({
				instructorId,
				instructorFirstName: meta.firstName,
				instructorLastName: meta.lastName,
				date: s.date,
				startTime: s.startTime,
				endTime: s.endTime,
			});
		}
	}

	const sort = query.sort ?? 'startTime';
	if (sort === 'instructorName') {
		all.sort((a, b) => {
			const ln = a.instructorLastName.localeCompare(b.instructorLastName);
			if (ln !== 0) {
				return ln;
			}
			const fn = a.instructorFirstName.localeCompare(
				b.instructorFirstName,
			);
			if (fn !== 0) {
				return fn;
			}
			const dc = compareYyyymmdd(a.date, b.date);
			if (dc !== 0) {
				return dc;
			}
			return a.startTime.localeCompare(b.startTime);
		});
	} else {
		all.sort((a, b) => {
			const dc = compareYyyymmdd(a.date, b.date);
			if (dc !== 0) {
				return dc;
			}
			const tc = a.startTime.localeCompare(b.startTime);
			if (tc !== 0) {
				return tc;
			}
			return a.instructorId.localeCompare(b.instructorId);
		});
	}

	const total = all.length;
	const limit = query.limit ?? 200;
	const offset = query.offset ?? 0;
	const paged = all.slice(offset, offset + limit);

	return { slots: paged, total };
}
