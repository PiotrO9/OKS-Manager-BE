import { describe, expect, it, vi } from 'vitest';
import { findStudentProfileIdsWithScheduleConflictsForEventWindow } from '../../services/event.service';

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
