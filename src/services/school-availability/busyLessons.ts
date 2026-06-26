import { LessonStatus, Role } from '@prisma/client';
import { getPrisma } from '../../lib/prisma';
import {
	formatYYYYMMDD,
	yyyymmddToDate,
} from './dateHelpers';
import type { Actor, BusyInterval } from './types';

const prisma = getPrisma();

export async function loadStudentBusyIntervals(
	actor: Actor,
	dateFrom: string,
	dateTo: string,
	excludeMyLessons: boolean,
): Promise<BusyInterval[]> {
	if (!excludeMyLessons || actor.role !== Role.STUDENT) {
		return [];
	}

	const profile = await prisma.studentProfile.findUnique({
		where: { userId: actor.id },
		select: { id: true },
	});
	if (!profile) {
		return [];
	}

	const rangeStart = yyyymmddToDate(dateFrom);
	const rangeEndExclusive = yyyymmddToDate(dateTo);
	rangeEndExclusive.setUTCDate(rangeEndExclusive.getUTCDate() + 1);

	const lessons = await prisma.lesson.findMany({
		where: {
			studentId: profile.id,
			status: { not: LessonStatus.CANCELLED },
			startTime: { gte: rangeStart, lt: rangeEndExclusive },
		},
		select: { startTime: true, endTime: true },
	});

	return lessons.map((l) => ({
		date: formatYYYYMMDD(l.startTime),
		startMin: l.startTime.getUTCHours() * 60 + l.startTime.getUTCMinutes(),
		endMin: l.endTime.getUTCHours() * 60 + l.endTime.getUTCMinutes(),
	}));
}
