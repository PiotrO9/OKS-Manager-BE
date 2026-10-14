import {
	CourseKind,
	CourseParticipantStatus,
	LessonStatus,
	LessonType,
	Role,
	VehicleAvailabilityStatus,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bookLesson, bookOwnLesson } from '../../services/lesson.service';

const { prismaMock, helperMocks } = vi.hoisted(() => ({
	helperMocks: {
		assertInstructorQualifiedForCourseType: vi.fn(),
		assertCourseDrivingPackageHoursAllowNewLesson: vi.fn(),
		assertStudentNoScheduleOverlap: vi.fn(),
		getCoursePracticePackageBalance: vi.fn(),
		assertInstructorTimeWindowAvailable: vi.fn(),
	},
	prismaMock: {
		$transaction: vi.fn((cb) => cb(prismaMock)),
		course: {
			findFirst: vi.fn(),
		},
		courseParticipant: {
			findFirst: vi.fn(),
		},
		drivingSchool: {
			findFirst: vi.fn(),
			findUnique: vi.fn(),
		},
		instructorEvent: {
			findFirst: vi.fn(),
		},
		instructorSchool: {
			findFirst: vi.fn(),
		},
		lesson: {
			create: vi.fn(),
			findFirst: vi.fn(),
		},
		schoolSettings: {
			findUnique: vi.fn(),
		},
		user: {
			findUnique: vi.fn(),
		},
		vehicle: {
			findFirst: vi.fn(),
			findMany: vi.fn(),
			updateMany: vi.fn(),
		},
	},
}));

vi.mock('../../lib/prisma', () => ({
	getPrisma: () => prismaMock,
}));

vi.mock('../../lib/instructorCourseQualification', () => ({
	assertInstructorQualifiedForCourseType:
		helperMocks.assertInstructorQualifiedForCourseType,
}));

vi.mock('../../lib/lesson-scheduling', () => ({
	getCoursePracticePackageBalance:
		helperMocks.getCoursePracticePackageBalance,
	assertCourseDrivingPackageHoursAllowNewLesson:
		helperMocks.assertCourseDrivingPackageHoursAllowNewLesson,
	assertStudentNoScheduleOverlap: helperMocks.assertStudentNoScheduleOverlap,
}));

vi.mock('../../services/instructor-availability.service', () => ({
	assertInstructorTimeWindowAvailable:
		helperMocks.assertInstructorTimeWindowAvailable,
}));

const actor = {
	id: '11111111-1111-4111-8111-111111111111',
	role: Role.STUDENT,
};
const courseId = '22222222-2222-4222-8222-222222222222';
const schoolId = '33333333-3333-4333-8333-333333333333';
const studentProfileId = '44444444-4444-4444-8444-444444444444';
const instructorId = '55555555-5555-4555-8555-555555555555';
const defaultVehicleId = '66666666-6666-4666-8666-666666666666';
const fallbackVehicleId = '77777777-7777-4777-8777-777777777777';
const startTime = '2099-06-22T08:00:00.000Z';
const endTime = '2099-06-22T09:00:00.000Z';

function mockCourse(kind: CourseKind = CourseKind.PRACTICAL) {
	prismaMock.course.findFirst.mockResolvedValue({
		id: courseId,
		schoolId,
		instructorId: null,
		courseTypeId: '88888888-8888-4888-8888-888888888888',
		kind,
		totalHours: 30,
	});
}

function mockStudent() {
	prismaMock.user.findUnique.mockResolvedValue({
		id: actor.id,
		role: Role.STUDENT,
		deletedAt: null,
		isActive: true,
		studentProfile: { id: studentProfileId },
	});
}

function mockHappyPath() {
	prismaMock.drivingSchool.findFirst.mockResolvedValue({ id: schoolId });
	mockCourse();
	mockStudent();
	prismaMock.schoolSettings.findUnique.mockResolvedValue({
		bookingMaxDaysAhead: 36500,
	});
	prismaMock.courseParticipant.findFirst.mockResolvedValue({
		id: 'participant-id',
		status: CourseParticipantStatus.ACTIVE,
	});
	prismaMock.instructorSchool.findFirst.mockResolvedValue({
		id: 'instructor-school-id',
	});
	helperMocks.assertInstructorQualifiedForCourseType.mockResolvedValue(
		undefined,
	);
	helperMocks.assertInstructorTimeWindowAvailable.mockResolvedValue(
		undefined,
	);
	helperMocks.assertStudentNoScheduleOverlap.mockResolvedValue(undefined);
	helperMocks.assertCourseDrivingPackageHoursAllowNewLesson.mockResolvedValue(
		undefined,
	);
	helperMocks.getCoursePracticePackageBalance.mockResolvedValue({
		bookedMinutes: 1770,
		remainingMinutes: 30,
	});
	prismaMock.drivingSchool.findUnique.mockResolvedValue({
		defaultVehicleId,
	});
	prismaMock.vehicle.findMany.mockResolvedValue([
		{ id: defaultVehicleId },
		{ id: fallbackVehicleId },
	]);
	prismaMock.vehicle.findFirst.mockResolvedValue({
		id: defaultVehicleId,
		schoolId,
		isActive: true,
		availabilityStatus: VehicleAvailabilityStatus.ACTIVE,
	});
	prismaMock.vehicle.updateMany.mockResolvedValue({ count: 0 });
	prismaMock.lesson.findFirst.mockResolvedValue(null);
	prismaMock.instructorEvent.findFirst.mockResolvedValue(null);
	prismaMock.lesson.create.mockResolvedValue({
		id: '99999999-9999-4999-8999-999999999999',
		courseId,
		studentId: studentProfileId,
		instructorId,
		vehicleId: defaultVehicleId,
		lessonType: LessonType.PRACTICE,
		startTime: new Date(startTime),
		endTime: new Date(endTime),
		status: LessonStatus.SCHEDULED,
		createdAt: new Date('2099-06-18T12:00:00.000Z'),
	});
}

describe('bookOwnLesson', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		prismaMock.$transaction.mockImplementation((cb) => cb(prismaMock));
	});

	it('creates a practice lesson for the authenticated student using the default vehicle', async () => {
		mockHappyPath();

		await expect(
			bookOwnLesson(actor, {
				courseId,
				instructorId,
				startTime,
				endTime,
			}),
		).resolves.toMatchObject({
			lesson: {
				courseId,
				studentId: studentProfileId,
				instructorId,
				vehicleId: defaultVehicleId,
				lessonType: LessonType.PRACTICE,
				status: LessonStatus.SCHEDULED,
			},
		});

		expect(prismaMock.lesson.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					studentId: studentProfileId,
					vehicleId: defaultVehicleId,
					lessonType: LessonType.PRACTICE,
				}),
			}),
		);
		expect(prismaMock.vehicle.updateMany).toHaveBeenCalledWith({
			where: {
				schoolId,
				isActive: true,
				availabilityStatus: VehicleAvailabilityStatus.UNAVAILABLE,
				unavailableUntil: { lt: expect.any(Date) },
			},
			data: {
				availabilityStatus: VehicleAvailabilityStatus.ACTIVE,
				unavailableUntil: null,
			},
		});
	});

	it('writes a 30-minute final lesson only after explicit remaining-package confirmation', async () => {
		mockHappyPath();
		prismaMock.schoolSettings.findUnique.mockResolvedValue({
			bookingMaxDaysAhead: 36500,
			practiceMinDurationMinutes: 60,
			practiceMaxDurationMinutes: 120,
			allowShortFinalPracticeLesson: true,
			minFinalPracticeDurationMinutes: 30,
		});
		await expect(
			bookOwnLesson(actor, {
				courseId,
				instructorId,
				startTime,
				endTime: '2099-06-22T08:30:00.000Z',
				bookingMode: 'REMAINING_PACKAGE',
			}),
		).resolves.toMatchObject({ lesson: { courseId } });
		expect(prismaMock.lesson.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					endTime: new Date('2099-06-22T08:30:00.000Z'),
				}),
			}),
		);
	});

	it('rejects non-student actors', async () => {
		await expect(
			bookOwnLesson(
				{ id: actor.id, role: Role.MANAGER },
				{ courseId, instructorId, startTime, endTime },
			),
		).rejects.toMatchObject({ statusCode: 403 });

		expect(prismaMock.course.findFirst).not.toHaveBeenCalled();
	});

	it.each([Role.MANAGER, Role.ADMIN])(
		'allows a %s booking with a qualified substitute without changing the course',
		async (role) => {
			mockHappyPath();
			const course = {
				id: courseId,
				schoolId,
				instructorId: 'assigned-instructor',
				courseTypeId: 'course-type-1',
				kind: CourseKind.PRACTICAL,
				totalHours: 30,
			};
			prismaMock.course.findFirst.mockResolvedValue(course);
			await expect(
				bookLesson(
					{ id: 'manager', role },
					{
						courseId,
						studentId: actor.id,
						instructorId,
						vehicleId: defaultVehicleId,
						startTime,
						endTime,
						lessonType: 'PRACTICE',
					},
				),
			).resolves.toMatchObject({ lesson: { instructorId } });
			expect(
				helperMocks.assertInstructorQualifiedForCourseType,
			).toHaveBeenCalledWith(instructorId, course.courseTypeId);
			expect(course.instructorId).toBe('assigned-instructor');
		},
	);

	it('still requires the assigned course instructor for student self-booking', async () => {
		mockHappyPath();
		prismaMock.course.findFirst.mockResolvedValue({
			id: courseId,
			schoolId,
			instructorId: 'assigned-instructor',
			courseTypeId: 'course-type-1',
			kind: CourseKind.PRACTICAL,
			totalHours: 30,
		});
		await expect(
			bookOwnLesson(actor, {
				courseId,
				instructorId,
				startTime,
				endTime,
			}),
		).rejects.toThrow(
			'instructor does not match course assigned instructor',
		);
		expect(prismaMock.lesson.create).not.toHaveBeenCalled();
	});

	it('rejects theory courses', async () => {
		mockCourse(CourseKind.THEORY_GROUP);
		prismaMock.schoolSettings.findUnique.mockResolvedValue({
			bookingMaxDaysAhead: 36500,
		});

		await expect(
			bookOwnLesson(actor, {
				courseId,
				instructorId,
				startTime,
				endTime,
			}),
		).rejects.toMatchObject({
			statusCode: 400,
			message: 'Course does not allow practice lessons',
		});
	});

	it('requires an active participant for the course', async () => {
		mockCourse();
		mockStudent();
		prismaMock.schoolSettings.findUnique.mockResolvedValue({
			bookingMaxDaysAhead: 36500,
		});
		prismaMock.courseParticipant.findFirst.mockResolvedValue(null);

		await expect(
			bookOwnLesson(actor, {
				courseId,
				instructorId,
				startTime,
				endTime,
			}),
		).rejects.toMatchObject({ statusCode: 403 });

		expect(prismaMock.courseParticipant.findFirst).toHaveBeenCalledWith({
			where: {
				courseId,
				studentId: studentProfileId,
				status: CourseParticipantStatus.ACTIVE,
			},
			select: { id: true },
		});
	});

	it('falls back to the first available active vehicle when the default vehicle is busy', async () => {
		mockHappyPath();
		prismaMock.lesson.findFirst
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({ id: 'default-conflict' })
			.mockResolvedValueOnce(null);
		prismaMock.lesson.create.mockResolvedValue({
			id: '99999999-9999-4999-8999-999999999999',
			courseId,
			studentId: studentProfileId,
			instructorId,
			vehicleId: fallbackVehicleId,
			lessonType: LessonType.PRACTICE,
			startTime: new Date(startTime),
			endTime: new Date(endTime),
			status: LessonStatus.SCHEDULED,
			createdAt: new Date('2099-06-18T12:00:00.000Z'),
		});

		await expect(
			bookOwnLesson(actor, {
				courseId,
				instructorId,
				startTime,
				endTime,
			}),
		).resolves.toMatchObject({
			lesson: { vehicleId: fallbackVehicleId },
		});
	});

	it('returns conflict when no vehicle is available', async () => {
		mockHappyPath();
		prismaMock.vehicle.findMany.mockResolvedValue([]);

		await expect(
			bookOwnLesson(actor, {
				courseId,
				instructorId,
				startTime,
				endTime,
			}),
		).rejects.toMatchObject({
			statusCode: 409,
			message: 'No available vehicle for this time slot',
		});
	});
});
