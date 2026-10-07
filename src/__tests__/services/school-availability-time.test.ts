import { LessonStatus, Role } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { schoolAvailabilitySlotsQuerySchema } from '../../schemas/school-availability.schemas';
import { loadStudentBusyIntervals } from '../../services/school-availability/busyLessons';
import { slotOverlapsLesson } from '../../services/school-availability/dateHelpers';
import { listSchoolAvailabilitySlots } from '../../services/school-availability/queries';

const { prismaMock, accessMock, selectionMock, slotsMock } = vi.hoisted(() => ({
	prismaMock: {
		studentProfile: { findUnique: vi.fn() },
		lesson: { findMany: vi.fn() },
	},
	accessMock: vi.fn(),
	selectionMock: vi.fn(),
	slotsMock: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({ getPrisma: () => prismaMock }));
vi.mock('../../services/school-availability/access', () => ({
	loadSchoolAndAssertSlotAccess: accessMock,
}));
vi.mock('../../services/school-availability/instructors', () => ({
	loadSchoolInstructorSelection: selectionMock,
}));
vi.mock('../../services/instructor-availability.service', () => ({
	generateSlotsInternal: slotsMock,
}));

const student = { id: 'user-1', role: Role.STUDENT };
const instructorIds = ['instructor-1', 'instructor-2'];
type LessonFixture = {
	startTime: Date;
	endTime: Date;
	status: LessonStatus;
};
let lessons: LessonFixture[];

function lesson(
	startTime: string,
	endTime: string,
	status: LessonStatus = LessonStatus.SCHEDULED,
) {
	return {
		startTime: new Date(startTime),
		endTime: new Date(endTime),
		status,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	lessons = [];
	prismaMock.studentProfile.findUnique.mockResolvedValue({ id: 'student-1' });
	prismaMock.lesson.findMany.mockImplementation(({ where }) =>
		lessons
			.filter(
				(row) =>
					row.status !== where.status.not &&
					row.startTime < where.startTime.lt &&
					row.endTime > (where.endTime?.gt ?? new Date(0)),
			)
			.map(({ startTime, endTime }) => ({ startTime, endTime })),
	);
	accessMock.mockResolvedValue({
		id: 'school-1',
		slotDurationMinutes: 60,
		bookingMaxDaysAhead: 30,
	});
	selectionMock.mockResolvedValue({
		instructorIds,
		metaById: new Map(
			instructorIds.map((id) => [
				id,
				{ firstName: id, lastName: 'Test' },
			]),
		),
	});
});

afterEach(() => {
	vi.useRealTimers();
});

describe('student busy lessons in Polish school slots', () => {
	it.each([
		['summer', '2026-07-15', '2026-07-15T08:00:00Z'],
		['winter', '2026-01-15', '2026-01-15T09:00:00Z'],
		['spring DST day', '2026-03-29', '2026-03-29T08:00:00Z'],
		['autumn DST day', '2026-10-25', '2026-10-25T09:00:00Z'],
	])('blocks 10:00–11:00 locally in %s', async (_, date, startUtc) => {
		const start = new Date(startUtc);
		lessons = [
			{
				startTime: start,
				endTime: new Date(start.getTime() + 3600000),
				status: LessonStatus.SCHEDULED,
			},
		];

		const busy = await loadStudentBusyIntervals(student, date, date, true);

		expect(busy).toEqual([{ date, startMin: 600, endMin: 660 }]);
		expect(
			slotOverlapsLesson(
				date,
				600,
				660,
				busy[0]!.date,
				busy[0]!.startMin,
				busy[0]!.endMin,
			),
		).toBe(true);
		expect(
			slotOverlapsLesson(
				date,
				660,
				720,
				busy[0]!.date,
				busy[0]!.startMin,
				busy[0]!.endMin,
			),
		).toBe(false);
	});

	it('uses Polish day bounds across both DST changes', async () => {
		await loadStudentBusyIntervals(
			student,
			'2026-03-29',
			'2026-03-29',
			true,
		);
		expect(prismaMock.lesson.findMany).toHaveBeenLastCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					startTime: { lt: new Date('2026-03-29T22:00:00Z') },
					endTime: { gt: new Date('2026-03-28T23:00:00Z') },
				}),
			}),
		);
		await loadStudentBusyIntervals(
			student,
			'2026-10-25',
			'2026-10-25',
			true,
		);
		expect(prismaMock.lesson.findMany).toHaveBeenLastCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					startTime: { lt: new Date('2026-10-25T23:00:00Z') },
					endTime: { gt: new Date('2026-10-24T22:00:00Z') },
				}),
			}),
		);
	});

	it.each([
		{
			name: 'spring clock advance',
			date: '2026-03-29',
			start: '2026-03-29T00:30:00Z',
			end: '2026-03-29T01:30:00Z',
			expected: [
				{ date: '2026-03-29', startMin: 90, endMin: 120 },
				{ date: '2026-03-29', startMin: 180, endMin: 210 },
			],
		},
		{
			name: 'autumn repeated hour',
			date: '2026-10-25',
			start: '2026-10-25T00:30:00Z',
			end: '2026-10-25T01:30:00Z',
			expected: [
				{ date: '2026-10-25', startMin: 150, endMin: 180 },
				{ date: '2026-10-25', startMin: 120, endMin: 150 },
			],
		},
	])(
		'splits a lesson at the $name',
		async ({ date, start, end, expected }) => {
			lessons = [lesson(start, end)];
			expect(
				await loadStudentBusyIntervals(student, date, date, true),
			).toEqual(expected);
		},
	);

	it('splits a lesson across Polish midnight, including a lesson started the day before', async () => {
		lessons = [lesson('2026-07-01T21:30:00Z', '2026-07-01T22:30:00Z')];

		expect(
			await loadStudentBusyIntervals(
				student,
				'2026-07-01',
				'2026-07-02',
				true,
			),
		).toEqual([
			{ date: '2026-07-01', startMin: 1410, endMin: 1440 },
			{ date: '2026-07-02', startMin: 0, endMin: 30 },
		]);
		expect(
			await loadStudentBusyIntervals(
				student,
				'2026-07-02',
				'2026-07-02',
				true,
			),
		).toEqual([{ date: '2026-07-02', startMin: 0, endMin: 30 }]);
	});

	it('excludes cancelled lessons and can omit the student conflict filter', async () => {
		lessons = [
			lesson(
				'2026-07-15T08:00:00Z',
				'2026-07-15T09:00:00Z',
				LessonStatus.CANCELLED,
			),
		];
		expect(
			await loadStudentBusyIntervals(
				student,
				'2026-07-15',
				'2026-07-15',
				true,
			),
		).toEqual([]);
		expect(
			await loadStudentBusyIntervals(
				student,
				'2026-07-15',
				'2026-07-15',
				false,
			),
		).toEqual([]);
		expect(prismaMock.lesson.findMany).toHaveBeenCalledTimes(1);
	});

	it('removes the conflicting slot for another instructor before pagination', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-07-01T12:00:00Z'));
		lessons = [lesson('2026-07-15T08:00:00Z', '2026-07-15T09:00:00Z')];
		slotsMock.mockImplementation(async () => [
			{ date: '2026-07-15', startTime: '10:00', endTime: '11:00' },
			{ date: '2026-07-15', startTime: '11:00', endTime: '12:00' },
		]);

		const result = await listSchoolAvailabilitySlots(
			student,
			'school-1',
			schoolAvailabilitySlotsQuerySchema.parse({
				dateFrom: '2026-07-15',
				dateTo: '2026-07-15',
				limit: 1,
			}),
		);

		expect(slotsMock).toHaveBeenCalledTimes(2);
		expect(result).toMatchObject({
			total: 2,
			slots: [{ instructorId: 'instructor-1', startTime: '11:00' }],
		});
	});

	it('uses the Polish date for today and booking horizon after local midnight', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-06T22:30:00Z'));
		accessMock.mockResolvedValue({
			id: 'school-1',
			slotDurationMinutes: 60,
			bookingMaxDaysAhead: 0,
		});
		slotsMock.mockResolvedValue([
			{ date: '2026-10-07', startTime: '10:00', endTime: '11:00' },
		]);

		const result = await listSchoolAvailabilitySlots(
			student,
			'school-1',
			schoolAvailabilitySlotsQuerySchema.parse({
				dateFrom: '2026-10-06',
				dateTo: '2026-10-08',
			}),
		);

		expect(slotsMock).toHaveBeenCalledWith(
			'instructor-1',
			'2026-10-07',
			'2026-10-07',
			60,
		);
		expect(result.total).toBe(2);
	});
});
