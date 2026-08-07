import { Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { filterInstructorIdsQualifiedForCourseType } from '../../lib/instructorCourseQualification';
import { getPrisma } from '../../lib/prisma';
import type { SchoolAvailabilitySlotsQuery } from '../../schemas/school-availability.schemas';
import { generateSlotsInternal } from '../instructor-availability.service';
import { loadSchoolAndAssertSlotAccess } from './access';
import { loadStudentBusyIntervals } from './busyLessons';
import {
	addDaysYyyymmdd,
	compareYyyymmdd,
	slotOverlapsLesson,
	timeToMinutes,
	utcTodayYyyymmdd,
	yyyymmddToDate,
} from './dateHelpers';
import { loadSchoolInstructorSelection } from './instructors';
import type { Actor, ListSchoolSlotsResult, SchoolSlotItemDto } from './types';

const prisma = getPrisma();

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

	const instructorSelection = await loadSchoolInstructorSelection(
		school.id,
		query.instructorIds,
	);
	let { instructorIds } = instructorSelection;
	const { metaById } = instructorSelection;

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
	const busyIntervals = await loadStudentBusyIntervals(
		actor,
		effectiveDateFrom,
		effectiveDateTo,
		excludeMyLessons,
	);

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
