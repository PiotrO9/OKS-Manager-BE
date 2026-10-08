import { LessonStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
	assertLessonHasNotStarted,
	assertLessonIsEditable,
} from '../../services/lesson/editability';

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

describe('changing an instructor on one lesson', () => {
	it('allows a scheduled lesson before its start', () => {
		expect(() =>
			assertLessonHasNotStarted(
				LessonStatus.SCHEDULED,
				new Date('2026-09-27T10:00:01.000Z'),
				now,
			),
		).not.toThrow();
	});

	it('rejects an ongoing lesson, including the exact start instant', () => {
		expect(() =>
			assertLessonHasNotStarted(LessonStatus.SCHEDULED, now, now),
		).toThrow('Only lessons that have not started can be changed');
		expect(() =>
			assertLessonHasNotStarted(
				LessonStatus.SCHEDULED,
				new Date('2026-09-27T09:00:00.000Z'),
				now,
			),
		).toThrow('Only lessons that have not started can be changed');
	});

	it('rejects a lesson that is no longer scheduled even if its start is future', () => {
		expect(() =>
			assertLessonHasNotStarted(
				LessonStatus.CANCELLED,
				new Date('2026-09-27T11:00:00.000Z'),
				now,
			),
		).toThrow('Only lessons that have not started can be changed');
	});
});
