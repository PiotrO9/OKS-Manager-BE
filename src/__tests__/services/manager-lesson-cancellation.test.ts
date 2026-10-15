import { LessonStatus, LessonType, Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../lib/http/AppError';
import { cancelLesson } from '../../services/lesson/cancelLessons';

const { prismaMock, assertAccess } = vi.hoisted(() => ({
	prismaMock: {
		lesson: {
			findFirst: vi.fn(),
			updateManyAndReturn: vi.fn(),
		},
	},
	assertAccess: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({ getPrisma: () => prismaMock }));
vi.mock('../../services/lesson/bookingRules', () => ({
	assertActorCanBookLessonForCourse: assertAccess,
	loadStudentProfileIdForUser: vi.fn(),
}));

const actor = { id: 'manager-id', role: Role.MANAGER };
const lessonId = 'lesson-id';
const future = new Date('2099-06-20T08:00:00.000Z');

function lesson(status: LessonStatus, startTime = future) {
	return {
		id: lessonId,
		courseId: 'course-id',
		studentId: 'student-id',
		instructorId: 'instructor-id',
		vehicleId: 'vehicle-id',
		lessonType: LessonType.PRACTICE,
		startTime,
		endTime: new Date(startTime.getTime() + 60 * 60 * 1000),
		status,
		createdAt: new Date('2026-10-14T08:00:00.000Z'),
		course: { schoolId: 'school-id' },
	};
}

describe('manager lesson cancellation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		prismaMock.lesson.findFirst.mockResolvedValue(
			lesson(LessonStatus.SCHEDULED),
		);
		prismaMock.lesson.updateManyAndReturn.mockResolvedValue([
			lesson(LessonStatus.CANCELLED),
		]);
	});

	it('cancels only a still-scheduled future lesson after school access check', async () => {
		const result = await cancelLesson(actor, lessonId);

		expect(assertAccess).toHaveBeenCalledWith(actor, 'school-id');
		expect(prismaMock.lesson.updateManyAndReturn).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					id: lessonId,
					status: LessonStatus.SCHEDULED,
					startTime: { gt: expect.any(Date) },
					deletedAt: null,
				}),
				data: { status: LessonStatus.CANCELLED },
			}),
		);
		expect(result.lesson.status).toBe(LessonStatus.CANCELLED);
	});

	it.each([LessonStatus.COMPLETED, LessonStatus.CANCELLED])(
		'rejects a lesson in status %s',
		async (status) => {
			prismaMock.lesson.findFirst.mockResolvedValue(lesson(status));
			await expect(cancelLesson(actor, lessonId)).rejects.toMatchObject({
				statusCode: 400,
			});
			expect(
				prismaMock.lesson.updateManyAndReturn,
			).not.toHaveBeenCalled();
		},
	);

	it('rejects a lesson that has already started', async () => {
		prismaMock.lesson.findFirst.mockResolvedValue(
			lesson(
				LessonStatus.SCHEDULED,
				new Date('2020-01-01T08:00:00.000Z'),
			),
		);
		await expect(cancelLesson(actor, lessonId)).rejects.toMatchObject({
			statusCode: 400,
		});
		expect(prismaMock.lesson.updateManyAndReturn).not.toHaveBeenCalled();
	});

	it('rejects when a concurrent change removes the conditional update target', async () => {
		prismaMock.lesson.updateManyAndReturn.mockResolvedValue([]);
		await expect(cancelLesson(actor, lessonId)).rejects.toMatchObject({
			statusCode: 409,
		});
	});

	it('does not update a lesson outside the manager school', async () => {
		assertAccess.mockRejectedValue(AppError.forbidden('Forbidden'));
		await expect(cancelLesson(actor, lessonId)).rejects.toMatchObject({
			statusCode: 403,
		});
		expect(prismaMock.lesson.updateManyAndReturn).not.toHaveBeenCalled();
	});
});
