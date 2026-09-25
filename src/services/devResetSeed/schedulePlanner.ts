import { instantToPolishDateTime } from '../../lib/polishScheduleTime';
import { addDays, atTime, type SeedWorkingWindow } from './dateHelpers';

export type SeedWorkingException = {
	date: Date;
	startTime: Date | null;
	endTime: Date | null;
	isDayOff: boolean;
};

export type SeedLeave = {
	startDate: Date;
	endDate: Date;
};

export type SeedInstructorCalendar = {
	windows: SeedWorkingWindow[];
	exceptions: SeedWorkingException[];
	leaves: SeedLeave[];
};

export type SeedSlotRequest = {
	anchor: Date;
	durationMinutes: number;
	instructorId: string;
	studentIds?: string[];
	vehicleId?: string;
	slotIndex?: number;
	stepMinutes?: number;
};

type Reservation = { start: number; end: number };

function timeOnlyMinutes(value: Date): number {
	return value.getUTCHours() * 60 + value.getUTCMinutes();
}

function dateKey(value: Date): string {
	return instantToPolishDateTime(value).date;
}

function overlaps(a: Reservation, b: Reservation): boolean {
	return a.start < b.end && a.end > b.start;
}

export class SeedSchedulePlanner {
	private readonly reservations = new Map<string, Reservation[]>();

	constructor(
		private readonly calendars: ReadonlyMap<string, SeedInstructorCalendar>,
	) {}

	reserve(request: SeedSlotRequest): { start: Date; end: Date } {
		if (request.durationMinutes <= 0) {
			throw new Error('Seed slot duration must be positive');
		}

		const calendar = this.calendars.get(request.instructorId);
		if (!calendar) {
			throw new Error(
				`Missing seed calendar for instructor ${request.instructorId}`,
			);
		}

		const resourceKeys = [
			...new Set([
				`instructor:${request.instructorId}`,
				...(request.studentIds ?? []).map((id) => `student:${id}`),
				...(request.vehicleId ? [`vehicle:${request.vehicleId}`] : []),
			]),
		];
		const stepMinutes = request.stepMinutes ?? 60;
		if (stepMinutes <= 0) {
			throw new Error('Seed slot step must be positive');
		}

		for (let dayOffset = 0; dayOffset < 120; dayOffset += 1) {
			const date = addDays(request.anchor, dayOffset);
			const window = this.resolveWindow(calendar, date);
			if (!window) continue;

			const windowStart = timeOnlyMinutes(window.startTime);
			const windowEnd = timeOnlyMinutes(window.endTime);
			const latestStart = windowEnd - request.durationMinutes;
			if (latestStart < windowStart) continue;

			const starts: number[] = [];
			for (
				let minute = windowStart;
				minute <= latestStart;
				minute += stepMinutes
			) {
				starts.push(minute);
			}
			const rotation = Math.abs(request.slotIndex ?? 0) % starts.length;
			const orderedStarts = [
				...starts.slice(rotation),
				...starts.slice(0, rotation),
			];

			for (const startMinute of orderedStarts) {
				const endMinute = startMinute + request.durationMinutes;
				const start = atTime(
					date,
					Math.floor(startMinute / 60),
					startMinute % 60,
				);
				const end = atTime(
					date,
					Math.floor(endMinute / 60),
					endMinute % 60,
				);
				const reservation = {
					start: start.getTime(),
					end: end.getTime(),
				};

				if (
					resourceKeys.some((key) =>
						(this.reservations.get(key) ?? []).some((existing) =>
							overlaps(existing, reservation),
						),
					)
				) {
					continue;
				}

				for (const key of resourceKeys) {
					const entries = this.reservations.get(key) ?? [];
					entries.push(reservation);
					this.reservations.set(key, entries);
				}

				return { start, end };
			}
		}

		throw new Error(
			`No conflict-free seed slot for instructor ${request.instructorId}`,
		);
	}

	private resolveWindow(
		calendar: SeedInstructorCalendar,
		date: Date,
	): { startTime: Date; endTime: Date } | null {
		const key = dateKey(date);
		if (
			calendar.leaves.some(
				(leave) =>
					key >= dateKey(leave.startDate) &&
					key <= dateKey(leave.endDate),
			)
		) {
			return null;
		}

		const exception = calendar.exceptions.find(
			(item) => dateKey(item.date) === key,
		);
		if (exception) {
			if (
				exception.isDayOff ||
				!exception.startTime ||
				!exception.endTime
			) {
				return null;
			}
			return {
				startTime: exception.startTime,
				endTime: exception.endTime,
			};
		}

		const dayOfWeek = instantToPolishDateTime(date).dayOfWeek;
		const window = calendar.windows.find(
			(item) => item.dayOfWeek === dayOfWeek,
		);

		return window
			? { startTime: window.startTime, endTime: window.endTime }
			: null;
	}
}
