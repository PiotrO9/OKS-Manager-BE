import { EventStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { findStudentProfileIdsWithScheduleConflictsForEventWindow } from '../../services/event.service';
import { eventStudentsAvailabilityCheckBodySchema } from '../../schemas/event.schemas';
import {
	assertStudentProfilesInEventCourse,
	getEventStudentReplacementIssues,
} from '../../services/event/participantWriteHelpers';

const eventId = '11111111-1111-1111-1111-111111111111';
const start = new Date('2026-06-01T10:00:00.000Z');
const end = new Date('2026-06-01T11:00:00.000Z');

describe('findStudentProfileIdsWithScheduleConflictsForEventWindow', () => {
	it('returns empty set when candidateProfileIds is empty', async () => {
		const tx = {
			lesson: { findMany: vi.fn() },
			eventParticipant: { findMany: vi.fn() },
		};
		const result =
			await findStudentProfileIdsWithScheduleConflictsForEventWindow(
				tx as never,
				{ eventId, start, end, candidateProfileIds: [] },
			);
		expect(result.size).toBe(0);
		expect(tx.lesson.findMany).not.toHaveBeenCalled();
		expect(tx.eventParticipant.findMany).not.toHaveBeenCalled();
	});

	it('merges lesson and other-event conflicts', async () => {
		const pidA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
		const pidB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
		const tx = {
			lesson: {
				findMany: vi.fn().mockResolvedValue([{ studentId: pidA }]),
			},
			eventParticipant: {
				findMany: vi.fn().mockResolvedValue([{ studentId: pidB }]),
			},
		};
		const result =
			await findStudentProfileIdsWithScheduleConflictsForEventWindow(
				tx as never,
				{ eventId, start, end, candidateProfileIds: [pidA, pidB] },
			);
		expect(result.has(pidA)).toBe(true);
		expect(result.has(pidB)).toBe(true);
		expect(tx.lesson.findMany).toHaveBeenCalledTimes(1);
		expect(tx.eventParticipant.findMany).toHaveBeenCalledTimes(1);
	});
});

describe('event student replacement availability', () => {
	it('requires both override boundaries and a positive window', () => {
		const studentId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

		expect(
			eventStudentsAvailabilityCheckBodySchema.safeParse({
				studentIds: [studentId],
				startTime: '2026-06-01T10:00:00.000Z',
			}).success,
		).toBe(false);
		expect(
			eventStudentsAvailabilityCheckBodySchema.safeParse({
				studentIds: [studentId],
				startTime: '2026-06-01T11:00:00.000Z',
				endTime: '2026-06-01T10:00:00.000Z',
			}).success,
		).toBe(false);
	});

	it('reports capacity and conflicting students without treating the edited event as a conflict', async () => {
		const userA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
		const userB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
		const profileA = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
		const profileB = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
		const db = {
			lesson: {
				findMany: vi.fn().mockResolvedValue([{ studentId: profileB }]),
			},
			eventParticipant: { findMany: vi.fn().mockResolvedValue([]) },
		};

		const issues = await getEventStudentReplacementIssues(
			{
				event: {
					id: eventId,
					instructorId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
					isActive: true,
					type: 'THEORY',
					startTime: start,
					endTime: end,
					capacity: 1,
					courseId: null,
				},
				studentUserIds: [userA, userB],
				studentProfileIds: [profileA, profileB],
				start,
				end,
			},
			db as never,
		);

		expect(issues).toEqual([
			{
				code: 'EVENT_CAPACITY_EXCEEDED',
				message: 'Liczba kursantów przekracza limit miejsc wydarzenia.',
			},
			{
				code: 'STUDENT_SCHEDULE_CONFLICT',
				message:
					'Co najmniej jeden kursant ma w tym czasie inną lekcję lub wydarzenie.',
				studentUserIds: [userB],
			},
		]);
		expect(db.eventParticipant.findMany).toHaveBeenCalledWith({
			where: {
				studentId: { in: [profileA, profileB] },
				eventId: { not: eventId },
				event: {
					isActive: true,
					status: { not: EventStatus.CANCELLED },
					startTime: { lt: end },
					endTime: { gt: start },
				},
			},
			select: { studentId: true },
		});
	});

	it('requires every selected student to be active in the linked course', async () => {
		const profileA = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
		const profileB = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
		const db = {
			courseParticipant: {
				findMany: vi.fn().mockResolvedValue([{ studentId: profileA }]),
			},
		};

		await expect(
			assertStudentProfilesInEventCourse(
				db as never,
				[profileA, profileB],
				'ffffffff-ffff-ffff-ffff-ffffffffffff',
			),
		).rejects.toMatchObject({ statusCode: 422 });
	});
});
