import { LessonStatus, LessonType, Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLessonInstructorOptions } from '../../services/lesson/instructorOptions';

const { mocks, prismaMock } = vi.hoisted(() => ({
	mocks: {
		assertActorCanBookLessonForCourse: vi.fn(),
		listInstructorsBySchoolForUser: vi.fn(),
		checkScheduleAvailability: vi.fn(),
	},
	prismaMock: { lesson: { findFirst: vi.fn() } },
}));

vi.mock('../../lib/prisma', () => ({ getPrisma: () => prismaMock }));
vi.mock('../../services/lesson/bookingRules', () => ({
	assertActorCanBookLessonForCourse: mocks.assertActorCanBookLessonForCourse,
}));
vi.mock('../../services/instructor/queries', () => ({
	listInstructorsBySchoolForUser: mocks.listInstructorsBySchoolForUser,
}));
vi.mock('../../services/schedule-validation/check', () => ({
	checkScheduleAvailability: mocks.checkScheduleAvailability,
}));

const actor = { id: 'manager-1', role: Role.MANAGER };
const lessonId = 'lesson-1';
const vehicleId = 'vehicle-1';
const query = {
	date: '2099-09-27',
	startTime: '10:00',
	endTime: '11:00',
	vehicleId,
};
const instructor = (id: string, qualifiedCourseTypes: { id: string }[]) => ({
	id,
	firstName: id,
	lastName: 'Test',
	email: `${id}@example.com`,
	avatarUrl: null,
	qualifiedCourseTypes,
});

describe('available substitute instructors for one lesson', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		prismaMock.lesson.findFirst.mockResolvedValue({
			id: lessonId,
			status: LessonStatus.SCHEDULED,
			startTime: new Date('2099-09-27T08:00:00.000Z'),
			lessonType: LessonType.PRACTICE,
			instructorId: 'current',
			course: { schoolId: 'school-1', courseTypeId: 'type-1' },
		});
		mocks.listInstructorsBySchoolForUser.mockResolvedValue({
			instructors: [
				instructor('current', [{ id: 'type-1' }]),
				instructor('free', [{ id: 'type-1' }]),
				instructor('busy', [{ id: 'type-1' }]),
				instructor('unqualified', [{ id: 'type-2' }]),
			],
		});
		mocks.checkScheduleAvailability.mockImplementation(
			async (_actor, body) => ({
				available: body.instructorId === 'free',
				issues: [],
				policy: {},
			}),
		);
	});

	it('returns only qualified instructors available for the chosen window and vehicle', async () => {
		const result = await getLessonInstructorOptions(actor, lessonId, query);
		expect(result.instructors.map((item) => item.id)).toEqual(['free']);
		expect(mocks.checkScheduleAvailability).toHaveBeenCalledTimes(2);
		expect(mocks.checkScheduleAvailability).toHaveBeenCalledWith(actor, {
			intent: 'lesson_edit',
			lessonId,
			instructorId: 'free',
			...query,
		});
	});

	it('rejects an ongoing lesson before listing instructors', async () => {
		prismaMock.lesson.findFirst.mockResolvedValue({
			id: lessonId,
			status: LessonStatus.SCHEDULED,
			startTime: new Date('2020-09-27T08:00:00.000Z'),
			lessonType: LessonType.PRACTICE,
			instructorId: 'current',
			course: { schoolId: 'school-1', courseTypeId: 'type-1' },
		});
		await expect(
			getLessonInstructorOptions(actor, lessonId, query),
		).rejects.toThrow('Only lessons that have not started can be changed');
		expect(mocks.listInstructorsBySchoolForUser).not.toHaveBeenCalled();
	});
});
