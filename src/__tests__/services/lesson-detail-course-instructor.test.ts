import { LessonStatus, LessonType, Role } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { getLessonById } from '../../services/lesson/readModel';

const { findFirst, assertAccess } = vi.hoisted(() => ({
	findFirst: vi.fn(),
	assertAccess: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({
	getPrisma: () => ({ lesson: { findFirst } }),
}));

vi.mock('../../services/lesson/bookingRules', () => ({
	assertActorCanBookLessonForCourse: assertAccess,
}));

describe('lesson detail course instructor', () => {
	it('returns the course instructor profile id separately from the lesson instructor', async () => {
		findFirst.mockResolvedValueOnce({
			id: 'lesson-1',
			courseId: 'course-1',
			studentId: 'student-1',
			instructorId: 'instructor-1',
			vehicleId: null,
			lessonType: LessonType.PRACTICE,
			startTime: new Date('2026-09-30T07:00:00.000Z'),
			endTime: new Date('2026-09-30T08:00:00.000Z'),
			status: LessonStatus.SCHEDULED,
			createdAt: new Date('2026-09-01T07:00:00.000Z'),
			course: {
				schoolId: 'school-1',
				school: {
					settings: { bookingMaxDaysAhead: 14, workingDaysMask: 62 },
				},
				instructor: {
					id: 'instructor-2',
					user: { firstName: 'Anna', lastName: 'Nowak' },
				},
			},
			instructorProfile: {
				id: 'instructor-1',
				userId: 'user-1',
				user: {
					firstName: 'Jan',
					lastName: 'Kowalski',
					email: 'jan@example.test',
					phone: null,
				},
			},
			studentProfile: {
				id: 'student-1',
				userId: 'user-2',
				user: {
					firstName: 'Ewa',
					lastName: 'Wisniewska',
					email: 'ewa@example.test',
					phone: null,
				},
			},
			vehicle: null,
		});

		const result = await getLessonById(
			{ id: 'manager-1', role: Role.MANAGER },
			'lesson-1',
		);

		expect(result.lesson.assignedCourseInstructor).toEqual({
			id: 'instructor-2',
			name: 'Anna Nowak',
		});
		expect(result.lesson.instructor.id).toBe('instructor-1');
		expect(result.lesson.schoolId).toBe('school-1');
		expect(result.lesson.bookingMaxDaysAhead).toBe(14);
		expect(result.lesson.schoolWorkingDaysMask).toBe(62);
		expect(assertAccess).toHaveBeenCalledWith(
			{ id: 'manager-1', role: Role.MANAGER },
			'school-1',
		);
	});
});
