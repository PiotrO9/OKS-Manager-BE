import { describe, expect, it } from 'vitest';
import {
	SeedSchedulePlanner,
	type SeedInstructorCalendar,
} from '../../services/devResetSeed/schedulePlanner';

const instructorId = 'instructor-1';
const secondInstructorId = 'instructor-2';
const weekdayWindow = {
	dayOfWeek: 1,
	startTime: new Date('1970-01-01T08:00:00.000Z'),
	endTime: new Date('1970-01-01T12:00:00.000Z'),
};

function planner(calendar: Partial<SeedInstructorCalendar> = {}) {
	const resolvedCalendar = {
		windows: [weekdayWindow],
		exceptions: [],
		leaves: [],
		...calendar,
	};

	return new SeedSchedulePlanner(
		new Map([
			[instructorId, resolvedCalendar],
			[secondInstructorId, resolvedCalendar],
		]),
	);
}

describe('SeedSchedulePlanner', () => {
	it('moves a weekend request into the next working window', () => {
		const slot = planner().reserve({
			anchor: new Date('2026-09-26T12:00:00.000Z'),
			durationMinutes: 60,
			instructorId,
		});

		expect(slot.start.toISOString()).toBe('2026-09-28T06:00:00.000Z');
		expect(slot.end.toISOString()).toBe('2026-09-28T07:00:00.000Z');
	});

	it('avoids collisions for an instructor', () => {
		const schedule = planner();
		const first = schedule.reserve({
			anchor: new Date('2026-09-28T12:00:00.000Z'),
			durationMinutes: 60,
			instructorId,
			studentIds: ['student-1'],
			vehicleId: 'vehicle-1',
		});
		const second = schedule.reserve({
			anchor: new Date('2026-09-28T12:00:00.000Z'),
			durationMinutes: 60,
			instructorId,
			studentIds: ['student-2'],
			vehicleId: 'vehicle-2',
		});

		expect(first.end.getTime()).toBeLessThanOrEqual(second.start.getTime());
	});

	it.each([
		{
			name: 'student',
			first: { studentIds: ['student-1'] },
			second: { studentIds: ['student-1'] },
		},
		{
			name: 'vehicle',
			first: { vehicleId: 'vehicle-1' },
			second: { vehicleId: 'vehicle-1' },
		},
	])('avoids collisions for a shared $name', ({ first, second }) => {
		const schedule = planner();
		const firstSlot = schedule.reserve({
			anchor: new Date('2026-09-28T12:00:00.000Z'),
			durationMinutes: 60,
			instructorId,
			...first,
		});
		const secondSlot = schedule.reserve({
			anchor: new Date('2026-09-28T12:00:00.000Z'),
			durationMinutes: 60,
			instructorId: secondInstructorId,
			...second,
		});

		expect(firstSlot.end.getTime()).toBeLessThanOrEqual(
			secondSlot.start.getTime(),
		);
	});

	it('skips leave and uses a dated working-hours exception', () => {
		const schedule = planner({
			windows: [weekdayWindow, { ...weekdayWindow, dayOfWeek: 2 }],
			leaves: [
				{
					startDate: new Date('2026-09-28T00:00:00.000Z'),
					endDate: new Date('2026-09-28T00:00:00.000Z'),
				},
			],
			exceptions: [
				{
					date: new Date('2026-09-29T00:00:00.000Z'),
					startTime: new Date('1970-01-01T10:00:00.000Z'),
					endTime: new Date('1970-01-01T13:00:00.000Z'),
					isDayOff: false,
				},
			],
		});

		const slot = schedule.reserve({
			anchor: new Date('2026-09-28T12:00:00.000Z'),
			durationMinutes: 60,
			instructorId,
		});

		expect(slot.start.toISOString()).toBe('2026-09-29T08:00:00.000Z');
	});

	it('treats adjacent reservations as non-overlapping', () => {
		const schedule = planner();
		const first = schedule.reserve({
			anchor: new Date('2026-09-28T12:00:00.000Z'),
			durationMinutes: 60,
			instructorId,
		});
		const second = schedule.reserve({
			anchor: new Date('2026-09-28T12:00:00.000Z'),
			durationMinutes: 60,
			instructorId,
		});

		expect(first.end.getTime()).toBe(second.start.getTime());
	});
});
