import {
	EventStatus,
	EventType,
	InstructorTimeBlockType,
	LessonStatus,
	LessonType,
} from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { assertSeedScheduleIntegrity } from '../../services/devResetSeed/scheduleIntegrity';

const baseLesson = {
	id: 'lesson-1',
	courseId: 'course-1',
	studentId: 'student-1',
	instructorId: 'instructor-1',
	vehicleId: 'vehicle-1',
	lessonType: LessonType.PRACTICE,
	startTime: new Date('2026-09-28T08:00:00.000Z'),
	endTime: new Date('2026-09-28T09:00:00.000Z'),
	status: LessonStatus.SCHEDULED,
};

describe('assertSeedScheduleIntegrity', () => {
	it('allows adjacent entries', () => {
		expect(() =>
			assertSeedScheduleIntegrity({
				lessons: [baseLesson],
				events: [
					{
						id: 'event-1',
						instructorId: 'instructor-1',
						schoolId: 'school-1',
						type: EventType.THEORY,
						startTime: new Date('2026-09-28T09:00:00.000Z'),
						endTime: new Date('2026-09-28T10:00:00.000Z'),
						status: EventStatus.PLANNED,
					},
				],
				eventParticipants: [],
				blocks: [],
			}),
		).not.toThrow();
	});

	it('rejects a conflict introduced outside the planner', () => {
		expect(() =>
			assertSeedScheduleIntegrity({
				lessons: [baseLesson],
				events: [],
				eventParticipants: [],
				blocks: [
					{
						id: 'block-1',
						instructorId: 'instructor-1',
						startTime: new Date('2026-09-28T08:30:00.000Z'),
						endTime: new Date('2026-09-28T09:30:00.000Z'),
						type: InstructorTimeBlockType.BREAK,
					},
				],
			}),
		).toThrow('Seed schedule conflict for instructor:instructor-1');
	});

	it('rejects a vehicle conflict between different instructors', () => {
		expect(() =>
			assertSeedScheduleIntegrity({
				lessons: [
					baseLesson,
					{
						...baseLesson,
						id: 'lesson-2',
						studentId: 'student-2',
						instructorId: 'instructor-2',
					},
				],
				events: [],
				eventParticipants: [],
				blocks: [],
			}),
		).toThrow('Seed schedule conflict for vehicle:vehicle-1');
	});

	it('rejects a zero-length schedule entry', () => {
		expect(() =>
			assertSeedScheduleIntegrity({
				lessons: [
					{
						...baseLesson,
						endTime: baseLesson.startTime,
					},
				],
				events: [],
				eventParticipants: [],
				blocks: [],
			}),
		).toThrow('Invalid seed schedule window for lesson:lesson-1');
	});

	it('ignores cancelled entries when checking resource conflicts', () => {
		expect(() =>
			assertSeedScheduleIntegrity({
				lessons: [
					baseLesson,
					{
						...baseLesson,
						id: 'lesson-2',
						status: LessonStatus.CANCELLED,
					},
				],
				events: [],
				eventParticipants: [],
				blocks: [],
			}),
		).not.toThrow();
	});
});
