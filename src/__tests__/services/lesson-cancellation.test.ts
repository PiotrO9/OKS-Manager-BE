import { LessonStatus, LessonType, Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelOwnLesson } from '../../services/lesson.service';

const { prismaMock } = vi.hoisted(() => ({
	prismaMock: {
		lesson: {
			findFirst: vi.fn(),
			update: vi.fn(),
			updateManyAndReturn: vi.fn(),
		},
		user: {
			findUnique: vi.fn(),
		},
	},
}));

vi.mock('../../lib/prisma', () => ({
	getPrisma: () => prismaMock,
}));

vi.mock('../../lib/instructorCourseQualification', () => ({
	assertInstructorQualifiedForCourseType: vi.fn(),
}));

vi.mock('../../lib/lesson-scheduling', () => ({
	assertCourseDrivingPackageHoursAllowNewLesson: vi.fn(),
	assertStudentNoScheduleOverlap: vi.fn(),
}));

vi.mock('../../services/instructor-availability.service', () => ({
	assertInstructorTimeWindowAvailable: vi.fn(),
}));

const actor = {
	id: '11111111-1111-4111-8111-111111111111',
	role: Role.STUDENT,
};
const lessonId = '22222222-2222-4222-8222-222222222222';
const courseId = '33333333-3333-4333-8333-333333333333';
const studentProfileId = '44444444-4444-4444-8444-444444444444';
const otherStudentProfileId = '55555555-5555-4555-8555-555555555555';
const instructorId = '66666666-6666-4666-8666-666666666666';
const vehicleId = '77777777-7777-4777-8777-777777777777';

function mockStudentProfile() {
	prismaMock.user.findUnique.mockResolvedValue({
		id: actor.id,
		role: Role.STUDENT,
		deletedAt: null,
		isActive: true,
		studentProfile: { id: studentProfileId },
	});
}

function mockLesson(
	overrides: Partial<{
		studentId: string;
		lessonType: LessonType;
		status: LessonStatus;
		startTime: Date;
	}> = {},
) {
	prismaMock.lesson.findFirst.mockResolvedValue({
		id: lessonId,
		studentId: overrides.studentId ?? studentProfileId,
		lessonType: overrides.lessonType ?? LessonType.PRACTICE,
		status: overrides.status ?? LessonStatus.SCHEDULED,
		startTime: overrides.startTime ?? new Date('2099-06-20T08:00:00.000Z'),
	});
}

function mockCancelledLessonUpdate() {
	prismaMock.lesson.updateManyAndReturn.mockResolvedValue([
		{
			id: lessonId,
			courseId,
			studentId: studentProfileId,
			instructorId,
			vehicleId,
			lessonType: LessonType.PRACTICE,
			startTime: new Date('2099-06-20T08:00:00.000Z'),
			endTime: new Date('2099-06-20T09:00:00.000Z'),
			status: LessonStatus.CANCELLED,
			createdAt: new Date('2099-06-18T12:00:00.000Z'),
		},
	]);
}

describe('cancelOwnLesson', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('cancels the authenticated student scheduled practice lesson', async () => {
		mockStudentProfile();
		mockLesson();
		mockCancelledLessonUpdate();

		await expect(cancelOwnLesson(actor, lessonId)).resolves.toMatchObject({
			lesson: {
				id: lessonId,
				studentId: studentProfileId,
				lessonType: LessonType.PRACTICE,
				status: LessonStatus.CANCELLED,
			},
		});

		expect(prismaMock.lesson.updateManyAndReturn).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					id: lessonId,
					studentId: studentProfileId,
					lessonType: LessonType.PRACTICE,
					status: LessonStatus.SCHEDULED,
					startTime: expect.objectContaining({
						gt: expect.any(Date),
					}),
				}),
				data: { status: LessonStatus.CANCELLED },
			}),
		);
	});

	it('rejects non-student actors', async () => {
		await expect(
			cancelOwnLesson({ id: actor.id, role: Role.MANAGER }, lessonId),
		).rejects.toMatchObject({ statusCode: 403 });

		expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
		expect(prismaMock.lesson.updateManyAndReturn).not.toHaveBeenCalled();
	});

	it('rejects when authenticated user has no student profile', async () => {
		prismaMock.user.findUnique.mockResolvedValue({
			id: actor.id,
			role: Role.STUDENT,
			deletedAt: null,
			isActive: true,
			studentProfile: null,
		});

		await expect(cancelOwnLesson(actor, lessonId)).rejects.toMatchObject({
			statusCode: 400,
		});

		expect(prismaMock.lesson.findFirst).not.toHaveBeenCalled();
	});

	it('returns 404 when lesson does not exist', async () => {
		mockStudentProfile();
		prismaMock.lesson.findFirst.mockResolvedValue(null);

		await expect(cancelOwnLesson(actor, lessonId)).rejects.toMatchObject({
			statusCode: 404,
		});

		expect(prismaMock.lesson.updateManyAndReturn).not.toHaveBeenCalled();
	});

	it('rejects lessons owned by another student', async () => {
		mockStudentProfile();
		mockLesson({ studentId: otherStudentProfileId });

		await expect(cancelOwnLesson(actor, lessonId)).rejects.toMatchObject({
			statusCode: 403,
		});

		expect(prismaMock.lesson.updateManyAndReturn).not.toHaveBeenCalled();
	});

	it('rejects non-practice lessons', async () => {
		mockStudentProfile();
		mockLesson({ lessonType: LessonType.THEORY });

		await expect(cancelOwnLesson(actor, lessonId)).rejects.toMatchObject({
			statusCode: 400,
			message: 'Only practice lessons can be cancelled',
		});
	});

	it('rejects completed lessons', async () => {
		mockStudentProfile();
		mockLesson({ status: LessonStatus.COMPLETED });

		await expect(cancelOwnLesson(actor, lessonId)).rejects.toMatchObject({
			statusCode: 400,
			message: 'Cannot cancel a completed lesson',
		});
	});

	it('rejects already cancelled lessons', async () => {
		mockStudentProfile();
		mockLesson({ status: LessonStatus.CANCELLED });

		await expect(cancelOwnLesson(actor, lessonId)).rejects.toMatchObject({
			statusCode: 400,
			message: 'Lesson is already cancelled',
		});
	});

	it('rejects scheduled practice lessons that have already started', async () => {
		mockStudentProfile();
		mockLesson({ startTime: new Date('2000-01-01T08:00:00.000Z') });

		await expect(cancelOwnLesson(actor, lessonId)).rejects.toMatchObject({
			statusCode: 400,
			message: 'Cannot cancel a lesson that has already started',
		});

		expect(prismaMock.lesson.updateManyAndReturn).not.toHaveBeenCalled();
	});

	it('rejects when the lesson becomes non-cancellable before the atomic update', async () => {
		mockStudentProfile();
		mockLesson();
		prismaMock.lesson.updateManyAndReturn.mockResolvedValue([]);

		await expect(cancelOwnLesson(actor, lessonId)).rejects.toMatchObject({
			statusCode: 400,
			message: 'Lesson is no longer cancellable',
		});
	});
});
