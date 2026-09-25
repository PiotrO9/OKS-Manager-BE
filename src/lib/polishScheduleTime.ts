import {
	fromDate,
	parseDate,
	parseDateTime,
	toZoned,
} from '@internationalized/date';
import { AppError } from './http/AppError';

export const POLISH_TIME_ZONE = 'Europe/Warsaw';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface PolishScheduleWindow {
	date: string;
	startTime: string;
	endTime: string;
}

export function polishLocalDateTimeToDate(date: string, time: string): Date {
	if (!DATE_RE.test(date) || !TIME_RE.test(time)) {
		throw AppError.badRequest('Invalid Polish local date or time');
	}

	try {
		return toZoned(
			parseDateTime(`${date}T${time}`),
			POLISH_TIME_ZONE,
			'reject',
		).toDate();
	} catch {
		throw AppError.badRequest(
			'Local time does not exist or is ambiguous in Europe/Warsaw',
		);
	}
}

export function parsePolishScheduleWindow(input: PolishScheduleWindow): {
	start: Date;
	end: Date;
	durationMinutes: number;
} {
	const start = polishLocalDateTimeToDate(input.date, input.startTime);
	const end = polishLocalDateTimeToDate(input.date, input.endTime);
	const durationMinutes = (end.getTime() - start.getTime()) / 60_000;

	if (durationMinutes <= 0) {
		throw AppError.badRequest('startTime must be before endTime');
	}

	return { start, end, durationMinutes };
}

export function polishDayBounds(date: string): {
	start: Date;
	end: Date;
} {
	if (!DATE_RE.test(date)) {
		throw AppError.badRequest('Invalid Polish local date');
	}

	try {
		const calendarDate = parseDate(date);
		return {
			start: toZoned(calendarDate, POLISH_TIME_ZONE, 'reject').toDate(),
			end: toZoned(
				calendarDate.add({ days: 1 }),
				POLISH_TIME_ZONE,
				'reject',
			).toDate(),
		};
	} catch {
		throw AppError.badRequest('Invalid Polish local date');
	}
}

export function instantToPolishDateTime(value: Date): {
	date: string;
	time: string;
	minutes: number;
	dayOfWeek: number;
} {
	const local = fromDate(value, POLISH_TIME_ZONE);
	const date = `${String(local.year).padStart(4, '0')}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
	const time = `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`;
	const dayOfWeek = new Date(
		Date.UTC(local.year, local.month - 1, local.day),
	).getUTCDay();

	return {
		date,
		time,
		minutes: local.hour * 60 + local.minute,
		dayOfWeek,
	};
}

export function polishTodayYyyymmdd(now = new Date()): string {
	return instantToPolishDateTime(now).date;
}
