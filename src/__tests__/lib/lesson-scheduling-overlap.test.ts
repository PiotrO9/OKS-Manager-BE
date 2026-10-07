import { EventStatus, Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { assertStudentNoScheduleOverlap } from '../../lib/lesson-scheduling';

const studentId = 'student-1';
const start = new Date('2026-10-07T10:00:00.000Z');
const end = new Date('2026-10-07T11:00:00.000Z');

describe('student overlap with retained event participants', () => {
	it.each([
		{
			name: 'an active planned theory block',
			status: EventStatus.PLANNED,
			isActive: true,
			eventStart: new Date('2026-10-07T10:30:00.000Z'),
			eventEnd: new Date('2026-10-07T11:30:00.000Z'),
			blocks: true,
		},
		{
			name: 'a cancelled theory block',
			status: EventStatus.CANCELLED,
			isActive: true,
			eventStart: new Date('2026-10-07T10:30:00.000Z'),
			eventEnd: new Date('2026-10-07T11:30:00.000Z'),
			blocks: false,
		},
		{
			name: 'an inactive theory block',
			status: EventStatus.PLANNED,
			isActive: false,
			eventStart: new Date('2026-10-07T10:30:00.000Z'),
			eventEnd: new Date('2026-10-07T11:30:00.000Z'),
			blocks: false,
		},
		{
			name: 'a theory block touching the interval boundary',
			status: EventStatus.PLANNED,
			isActive: true,
			eventStart: end,
			eventEnd: new Date('2026-10-07T12:00:00.000Z'),
			blocks: false,
		},
	])('$name', async ({ status, isActive, eventStart, eventEnd, blocks }) => {
		const participant = { id: 'participant-1', studentId };
		const eventFindFirst = vi.fn().mockImplementation(({ where }) => {
			const event = where.event;
			const matches =
				where.studentId === participant.studentId &&
				(isActive === event.isActive || event.isActive === undefined) &&
				(status !== event.status?.not || event.status === undefined) &&
				eventStart < event.startTime.lt &&
				eventEnd > event.endTime.gt;
			return matches ? participant : null;
		});
		const tx = {
			lesson: { findFirst: vi.fn().mockResolvedValue(null) },
			eventParticipant: { findFirst: eventFindFirst },
		} as unknown as Prisma.TransactionClient;

		const check = assertStudentNoScheduleOverlap(tx, studentId, start, end);
		if (blocks) {
			await expect(check).rejects.toMatchObject({ statusCode: 409 });
		} else {
			await expect(check).resolves.toBeUndefined();
		}
		expect(eventFindFirst).toHaveBeenCalledTimes(1);
	});
});
