import { LessonStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { assertLessonIsEditable } from '../../services/lesson/editability';

const now = new Date('2026-09-27T10:00:00.000Z');

describe('lesson editability', () => {
	it('allows a scheduled lesson that has not ended', () => {
		expect(() =>
			assertLessonIsEditable(
				LessonStatus.SCHEDULED,
				new Date('2026-09-27T11:00:00.000Z'),
				now,
			),
		).not.toThrow();
	});

	it('rejects completed lessons and scheduled lessons whose end time passed', () => {
		expect(() =>
			assertLessonIsEditable(
				LessonStatus.COMPLETED,
				new Date('2026-09-28T11:00:00.000Z'),
				now,
			),
		).toThrow('Only scheduled lessons can be edited');
		expect(() =>
			assertLessonIsEditable(LessonStatus.SCHEDULED, now, now),
		).toThrow('Finished lessons cannot be edited');
	});
});
