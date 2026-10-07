import { fromDate } from '@internationalized/date';
import { LessonStatus, Role } from '@prisma/client';
import { getPrisma } from '../../lib/prisma';
import {
	POLISH_TIME_ZONE,
	instantToPolishDateTime,
	polishDayBounds,
} from '../../lib/polishScheduleTime';
import { addDaysYyyymmdd, compareYyyymmdd } from './dateHelpers';
import type { Actor, BusyInterval } from './types';

const prisma = getPrisma();

function appendBusyOnPolishDay(
	busy: BusyInterval[],
	date: string,
	start: Date,
	end: Date,
): void {
	const offsetAt = (millis: number) =>
		fromDate(new Date(millis), POLISH_TIME_ZONE).offset;
	let segmentStart = start.getTime();
	const endMillis = end.getTime();
	while (segmentStart < endMillis) {
		const offset = offsetAt(segmentStart);
		let segmentEnd = endMillis;
		if (offsetAt(endMillis - 1) !== offset) {
			let before = segmentStart;
			let after = endMillis - 1;
			while (before + 1 < after) {
				const middle = Math.floor((before + after) / 2);
				if (offsetAt(middle) === offset) {
					before = middle;
				} else {
					after = middle;
				}
			}
			segmentEnd = after;
		}
		const startMin = instantToPolishDateTime(
			new Date(segmentStart),
		).minutes;
		busy.push({
			date,
			startMin,
			endMin: startMin + (segmentEnd - segmentStart) / 60_000,
		});
		segmentStart = segmentEnd;
	}
}

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

	const rangeStart = polishDayBounds(dateFrom).start;
	const rangeEndExclusive = polishDayBounds(dateTo).end;

	const lessons = await prisma.lesson.findMany({
		where: {
			studentId: profile.id,
			status: { not: LessonStatus.CANCELLED },
			startTime: { lt: rangeEndExclusive },
			endTime: { gt: rangeStart },
		},
		select: { startTime: true, endTime: true },
	});

	const busy: BusyInterval[] = [];
	for (const lesson of lessons) {
		const clippedStart = new Date(
			Math.max(lesson.startTime.getTime(), rangeStart.getTime()),
		);
		let date = instantToPolishDateTime(clippedStart).date;
		while (compareYyyymmdd(date, dateTo) <= 0) {
			const day = polishDayBounds(date);
			const start = new Date(
				Math.max(lesson.startTime.getTime(), day.start.getTime()),
			);
			const end = new Date(
				Math.min(lesson.endTime.getTime(), day.end.getTime()),
			);
			if (start >= end) {
				break;
			}
			appendBusyOnPolishDay(busy, date, start, end);
			date = addDaysYyyymmdd(date, 1);
		}
	}
	return busy;
}
