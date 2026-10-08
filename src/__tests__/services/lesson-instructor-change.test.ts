import { LessonStatus, LessonType, Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateLesson } from '../../services/lesson/writeModel';

const { mocks, tx } = vi.hoisted(() => {
	const tx = {
		lesson: { findFirst: vi.fn(), update: vi.fn() },
		instructorSchool: { findFirst: vi.fn() },
		vehicle: { findFirst: vi.fn() },
	};
	return {
		tx,
		mocks: {
			runScheduleWriteTransaction: vi.fn(async (write) => write(tx)),
			assertActorCanBookLessonForCourse: vi.fn(),
			assertInstructorQualifiedForCourseType: vi.fn(),
			assertLessonSchedulingWindowAvailable: vi.fn(),
			validateVehicleForInstructor: vi.fn(),
			vehicleHasBookingConflict: vi.fn(),
		},
	};
});

vi.mock('../../services/schedule-validation/transaction', () => ({
	runScheduleWriteTransaction: mocks.runScheduleWriteTransaction,
}));
vi.mock('../../services/lesson/bookingRules', () => ({
	assertActorCanBookLessonForCourse: mocks.assertActorCanBookLessonForCourse,
	assertLessonTimeIsBookable: vi.fn(),
}));
vi.mock('../../lib/instructorCourseQualification', () => ({
	assertInstructorQualifiedForCourseType:
		mocks.assertInstructorQualifiedForCourseType,
}));
vi.mock('../../services/lesson/scheduleConflicts', () => ({
	assertLessonSchedulingWindowAvailable:
		mocks.assertLessonSchedulingWindowAvailable,
}));
vi.mock('../../lib/vehicle.helpers', () => ({
	validateVehicleForInstructor: mocks.validateVehicleForInstructor,
}));
vi.mock('../../services/lesson/vehicleAvailability', () => ({
	vehicleHasBookingConflict: mocks.vehicleHasBookingConflict,
}));

const lessonId = '11111111-1111-4111-8111-111111111111';
const oldInstructorId = '22222222-2222-4222-8222-222222222222';
const newInstructorId = '33333333-3333-4333-8333-333333333333';
const vehicleId = '44444444-4444-4444-8444-444444444444';
const startTime = '2099-09-27T08:00:00.000Z';
const endTime = '2099-09-27T09:00:00.000Z';
const actor = {
	id: '55555555-5555-4555-8555-555555555555',
	role: Role.MANAGER,
};

function lessonRow() {
	return {
		id: lessonId,
		status: LessonStatus.SCHEDULED,
		lessonType: LessonType.PRACTICE,
		courseId: 'course-1',
		studentId: 'student-1',
		instructorId: oldInstructorId,
		vehicleId,
		startTime: new Date(startTime),
		endTime: new Date(endTime),
		createdAt: new Date('2026-01-01T00:00:00.000Z'),
		course: {
			id: 'course-1',
			schoolId: 'school-1',
			courseTypeId: 'type-1',
			kind: 'PRACTICAL',
			totalHours: 30,
		},
	};
}

const expectedLessonState = {
	instructorId: oldInstructorId,
	startTime,
	endTime,
	vehicleId,
};

describe('single practice lesson instructor change', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		tx.lesson.findFirst.mockResolvedValue(lessonRow());
		tx.instructorSchool.findFirst.mockResolvedValue({ id: 'link-1' });
		tx.vehicle.findFirst.mockResolvedValue({ id: vehicleId });
		tx.lesson.update.mockImplementation(async ({ data }) => ({
			...lessonRow(),
			...data,
		}));
		mocks.vehicleHasBookingConflict.mockResolvedValue(false);
	});

	it('updates only this lesson, preserving its time and vehicle', async () => {
		await updateLesson(actor, lessonId, {
			instructorId: newInstructorId,
			expectedLessonState,
		});

		expect(tx.lesson.update).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: lessonId },
				data: {
					instructorId: newInstructorId,
					vehicleId,
					startTime: new Date(startTime),
					endTime: new Date(endTime),
				},
			}),
		);
		expect(
			mocks.assertInstructorQualifiedForCourseType,
		).toHaveBeenCalledWith(newInstructorId, 'type-1', tx);
		expect(
			mocks.assertLessonSchedulingWindowAvailable,
		).toHaveBeenCalledWith(
			tx,
			expect.objectContaining({
				instructorId: newInstructorId,
				excludeLessonId: lessonId,
			}),
		);
		expect(mocks.validateVehicleForInstructor).toHaveBeenCalledWith(
			newInstructorId,
			vehicleId,
			tx,
			{ requireAvailable: true },
		);
	});

	it('rejects stale lesson state before checking availability or writing', async () => {
		await expect(
			updateLesson(actor, lessonId, {
				instructorId: newInstructorId,
				expectedLessonState: {
					...expectedLessonState,
					vehicleId: null,
				},
			}),
		).rejects.toThrow('Lesson changed while editing');
		expect(
			mocks.assertLessonSchedulingWindowAvailable,
		).not.toHaveBeenCalled();
		expect(tx.lesson.update).not.toHaveBeenCalled();
	});

	it('rejects instructor changes after the original lesson has started', async () => {
		tx.lesson.findFirst.mockResolvedValue({
			...lessonRow(),
			startTime: new Date('2020-09-27T08:00:00.000Z'),
			endTime: new Date('2099-09-27T09:00:00.000Z'),
		});
		await expect(
			updateLesson(actor, lessonId, {
				instructorId: newInstructorId,
				expectedLessonState: {
					...expectedLessonState,
					startTime: '2020-09-27T08:00:00.000Z',
				},
			}),
		).rejects.toThrow('Only lessons that have not started can be changed');
		expect(tx.lesson.update).not.toHaveBeenCalled();
	});
});
