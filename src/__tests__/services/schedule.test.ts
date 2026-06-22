import {
	EventStatus,
	EventType,
	LessonStatus,
	LessonType,
	Role,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleQuerySchema } from '../../schemas/schedule.schemas';
import { getMySchedule, getScheduleForTarget } from '../../services/schedule.service';

const { prismaMock } = vi.hoisted(() => ({
	prismaMock: {
		drivingSchool: {
			findFirst: vi.fn(),
		},
		instructorEvent: {
			findMany: vi.fn(),
		},
		lesson: {
			findMany: vi.fn(),
		},
		studentProfile: {
			findUnique: vi.fn(),
		},
	},
}));

vi.mock('../../lib/prisma', () => ({
	getPrisma: () => prismaMock,
}));

const actorId = '11111111-1111-4111-8111-111111111111';
const studentProfileId = '22222222-2222-4222-8222-222222222222';
const schoolId = '33333333-3333-4333-8333-333333333333';
const instructorProfileId = '44444444-4444-4444-8444-444444444444';
const vehicleId = '55555555-5555-4555-8555-555555555555';

function lessonRow(overrides: {
	id?: string;
	startTime?: string;
	endTime?: string;
	lessonType?: LessonType;
	status?: LessonStatus;
} = {}) {
	return {
		id: overrides.id ?? 'lesson-1',
		lessonType: overrides.lessonType ?? LessonType.PRACTICE,
		status: overrides.status ?? LessonStatus.SCHEDULED,
		startTime: new Date(overrides.startTime ?? '2026-06-22T10:00:00.000Z'),
		endTime: new Date(overrides.endTime ?? '2026-06-22T11:00:00.000Z'),
		instructorProfile: {
			id: instructorProfileId,
			user: { firstName: 'Anna', lastName: 'Nowak' },
		},
		studentProfile: {
			id: studentProfileId,
			user: { firstName: 'Jan', lastName: 'Kowalski' },
		},
		vehicle: {
			id: vehicleId,
			name: 'Toyota Yaris',
			registrationNumber: 'WX12345',
		},
		lessonRating: null,
	};
}

function eventRow(overrides: {
	id?: string;
	startTime?: string;
	endTime?: string;
	type?: EventType;
	status?: EventStatus;
} = {}) {
	return {
		id: overrides.id ?? 'event-1',
		type: overrides.type ?? EventType.THEORY,
		status: overrides.status ?? EventStatus.PLANNED,
		startTime: new Date(overrides.startTime ?? '2026-06-22T09:00:00.000Z'),
		endTime: new Date(overrides.endTime ?? '2026-06-22T10:00:00.000Z'),
		capacity: 12,
		instructor: {
			id: instructorProfileId,
			user: { firstName: 'Anna', lastName: 'Nowak' },
		},
		vehicle: null,
		participants: [
			{
				student: {
					id: studentProfileId,
					user: { firstName: 'Jan', lastName: 'Kowalski' },
				},
			},
		],
	};
}

describe('schedule service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		prismaMock.drivingSchool.findFirst.mockResolvedValue({ id: schoolId });
		prismaMock.instructorEvent.findMany.mockResolvedValue([]);
		prismaMock.lesson.findMany.mockResolvedValue([]);
		prismaMock.studentProfile.findUnique.mockResolvedValue({
			id: studentProfileId,
		});
	});

	it('returns student practice lessons and theory events in one sorted list', async () => {
		prismaMock.lesson.findMany.mockResolvedValue([
			lessonRow({ id: 'lesson-later' }),
		]);
		prismaMock.instructorEvent.findMany.mockResolvedValue([
			eventRow({ id: 'event-earlier' }),
		]);

		const result = await getMySchedule(
			{ id: actorId, role: Role.STUDENT },
			{ dateFrom: '2026-06-22', dateTo: '2026-06-22' },
		);

		expect(result.items).toMatchObject([
			{
				kind: 'instructor_event',
				id: 'event-earlier',
				type: LessonType.THEORY,
				instructor: { firstName: 'Anna', lastName: 'Nowak' },
			},
			{
				kind: 'lesson',
				id: 'lesson-later',
				type: LessonType.PRACTICE,
				instructor: { firstName: 'Anna', lastName: 'Nowak' },
			},
		]);
	});

	it('returns an empty student schedule when no rows exist', async () => {
		await expect(
			getMySchedule(
				{ id: actorId, role: Role.STUDENT },
				{ dateFrom: '2026-06-22', dateTo: '2026-06-28' },
			),
		).resolves.toEqual({ items: [] });
	});

	it('filters manager student schedule by school context', async () => {
		prismaMock.lesson.findMany.mockResolvedValue([lessonRow()]);
		prismaMock.instructorEvent.findMany.mockResolvedValue([eventRow()]);

		await getScheduleForTarget(
			{ id: actorId, role: Role.MANAGER },
			{
				dateFrom: '2026-06-22',
				dateTo: '2026-06-28',
				studentId: studentProfileId,
				schoolId,
			},
		);

		expect(prismaMock.drivingSchool.findFirst).toHaveBeenCalledWith({
			where: { id: schoolId, ownerId: actorId, deletedAt: null },
			select: { id: true },
		});
		expect(prismaMock.lesson.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					studentId: studentProfileId,
					course: { schoolId, deletedAt: null },
				}),
			}),
		);
		expect(prismaMock.instructorEvent.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					participants: { some: { studentId: studentProfileId } },
					course: { is: { schoolId, deletedAt: null } },
				}),
			}),
		);
	});

	it('rejects manager student schedule outside owned school', async () => {
		prismaMock.drivingSchool.findFirst.mockResolvedValue(null);

		await expect(
			getScheduleForTarget(
				{ id: actorId, role: Role.MANAGER },
				{
					dateFrom: '2026-06-22',
					dateTo: '2026-06-28',
					studentId: studentProfileId,
					schoolId,
				},
			),
		).rejects.toMatchObject({
			statusCode: 403,
			message: 'Forbidden',
		});
		expect(prismaMock.lesson.findMany).not.toHaveBeenCalled();
		expect(prismaMock.instructorEvent.findMany).not.toHaveBeenCalled();
	});

	it('validates date range and required schoolId for manager student schedule', () => {
		expect(
			scheduleQuerySchema.safeParse({
				dateFrom: '2026-06-29',
				dateTo: '2026-06-22',
				studentId: studentProfileId,
				schoolId,
			}).success,
		).toBe(false);

		const missingSchool = scheduleQuerySchema.safeParse({
			dateFrom: '2026-06-22',
			dateTo: '2026-06-28',
			studentId: studentProfileId,
		});

		expect(missingSchool.success).toBe(false);
		if (!missingSchool.success) {
			expect(missingSchool.error.issues[0]?.message).toBe(
				'schoolId is required when filtering by studentId',
			);
		}
	});
});
