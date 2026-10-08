import { EventType, Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../lib/http/AppError';
import { ScheduleDomainError } from '../../lib/http/ScheduleDomainError';
import { checkScheduleAvailability } from '../../services/schedule-validation/check';

const { mocks, prismaMock } = vi.hoisted(() => ({
	mocks: {
		assertActorCanManageAvailability: vi.fn(),
		resolveActiveInstructorProfile: vi.fn(),
		resolveInstructorEventSchoolId: vi.fn(),
		assertCourseEligibleForInstructorEvent: vi.fn(),
		validateVehicleForInstructor: vi.fn(),
		assertInstructorEventWindowAvailable: vi.fn(),
		assertVehicleAvailableForEventWindow: vi.fn(),
		assertActorCanBookLessonForCourse: vi.fn(),
		assertCourseCanBeSelfBooked: vi.fn(),
		assertInstructorCanBookCourse: vi.fn(),
		assertStudentParticipatesInCourse: vi.fn(),
		loadCourseForBooking: vi.fn(),
		loadStudentProfileIdForUser: vi.fn(),
		assertLessonTimeIsBookable: vi.fn(),
		assertLessonSchedulingWindowAvailable: vi.fn(),
		assertVehicleAvailableForBooking: vi.fn(),
		findAvailableVehicleIdForStudentBooking: vi.fn(),
		vehicleHasBookingConflict: vi.fn(),
		assertInstructorQualifiedForCourseType: vi.fn(),
	},
	prismaMock: {
		$transaction: vi.fn(async (callback) => callback(prismaMock)),
		schoolSettings: { findUnique: vi.fn() },
		instructorEvent: { findUnique: vi.fn() },
		lesson: { findFirst: vi.fn() },
		instructorSchool: { findFirst: vi.fn() },
		vehicle: { findFirst: vi.fn() },
	},
}));

vi.mock('../../lib/prisma', () => ({ getPrisma: () => prismaMock }));
vi.mock('../../services/instructor-availability.service', () => ({
	assertActorCanManageAvailability: mocks.assertActorCanManageAvailability,
	resolveActiveInstructorProfile: mocks.resolveActiveInstructorProfile,
}));
vi.mock('../../services/event/writeModel', () => ({
	resolveInstructorEventSchoolId: mocks.resolveInstructorEventSchoolId,
}));
vi.mock('../../services/event/courseEligibility', () => ({
	assertCourseEligibleForInstructorEvent:
		mocks.assertCourseEligibleForInstructorEvent,
}));
vi.mock('../../lib/vehicle.helpers', () => ({
	validateVehicleForInstructor: mocks.validateVehicleForInstructor,
}));
vi.mock('../../services/event/writeConflicts', () => ({
	assertInstructorEventWindowAvailable:
		mocks.assertInstructorEventWindowAvailable,
	assertVehicleAvailableForEventWindow:
		mocks.assertVehicleAvailableForEventWindow,
}));
vi.mock('../../services/lesson/bookingAccess', () => ({
	assertActorCanBookLessonForCourse: mocks.assertActorCanBookLessonForCourse,
	assertCourseCanBeSelfBooked: mocks.assertCourseCanBeSelfBooked,
	assertInstructorCanBookCourse: mocks.assertInstructorCanBookCourse,
	assertStudentParticipatesInCourse: mocks.assertStudentParticipatesInCourse,
	loadCourseForBooking: mocks.loadCourseForBooking,
	loadStudentProfileIdForUser: mocks.loadStudentProfileIdForUser,
}));
vi.mock('../../services/lesson/bookingRules', () => ({
	assertLessonTimeIsBookable: mocks.assertLessonTimeIsBookable,
}));
vi.mock('../../services/lesson/scheduleConflicts', () => ({
	assertLessonSchedulingWindowAvailable:
		mocks.assertLessonSchedulingWindowAvailable,
}));
vi.mock('../../services/lesson/vehicleAvailability', () => ({
	assertVehicleAvailableForBooking: mocks.assertVehicleAvailableForBooking,
	findAvailableVehicleIdForStudentBooking:
		mocks.findAvailableVehicleIdForStudentBooking,
	vehicleHasBookingConflict: mocks.vehicleHasBookingConflict,
}));
vi.mock('../../lib/instructorCourseQualification', () => ({
	assertInstructorQualifiedForCourseType:
		mocks.assertInstructorQualifiedForCourseType,
}));

const actor = {
	id: '11111111-1111-4111-8111-111111111111',
	role: Role.MANAGER,
};
const instructorId = '22222222-2222-4222-8222-222222222222';
const vehicleId = '33333333-3333-4333-8333-333333333333';
const eventId = '44444444-4444-4444-8444-444444444444';
const lessonId = '55555555-5555-4555-8555-555555555555';
const courseId = '66666666-6666-4666-8666-666666666666';
const studentId = '77777777-7777-4777-8777-777777777777';
const studentProfileId = '88888888-8888-4888-8888-888888888888';

describe('schedule availability check', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.assertActorCanManageAvailability.mockResolvedValue(undefined);
		mocks.resolveActiveInstructorProfile.mockResolvedValue(undefined);
		mocks.assertCourseEligibleForInstructorEvent.mockResolvedValue(
			undefined,
		);
		mocks.validateVehicleForInstructor.mockResolvedValue(undefined);
		mocks.assertInstructorEventWindowAvailable.mockResolvedValue(undefined);
		mocks.assertVehicleAvailableForEventWindow.mockResolvedValue(undefined);
		mocks.assertActorCanBookLessonForCourse.mockResolvedValue(undefined);
		mocks.assertCourseCanBeSelfBooked.mockReturnValue(undefined);
		mocks.assertInstructorCanBookCourse.mockResolvedValue(undefined);
		mocks.assertStudentParticipatesInCourse.mockResolvedValue(undefined);
		mocks.loadStudentProfileIdForUser.mockResolvedValue(studentProfileId);
		mocks.assertLessonTimeIsBookable.mockResolvedValue(undefined);
		mocks.assertLessonSchedulingWindowAvailable.mockResolvedValue(
			undefined,
		);
		mocks.vehicleHasBookingConflict.mockResolvedValue(false);
		mocks.assertVehicleAvailableForBooking.mockResolvedValue(undefined);
		mocks.findAvailableVehicleIdForStudentBooking.mockResolvedValue(
			vehicleId,
		);
		mocks.assertInstructorQualifiedForCourseType.mockResolvedValue(
			undefined,
		);
		mocks.resolveInstructorEventSchoolId.mockResolvedValue('school-1');
		mocks.loadCourseForBooking.mockResolvedValue({
			id: courseId,
			schoolId: 'school-1',
			instructorId: null,
			courseTypeId: 'course-type-1',
			kind: 'PRACTICAL',
			totalHours: 30,
		});
		prismaMock.schoolSettings.findUnique.mockResolvedValue({
			practiceMinDurationMinutes: 60,
			practiceMaxDurationMinutes: 120,
			theoryMinDurationMinutes: 45,
			theoryMaxDurationMinutes: 90,
		});
		prismaMock.instructorEvent.findUnique.mockResolvedValue({
			id: eventId,
			isActive: true,
			instructorId,
			courseId: null,
			type: EventType.DRIVE,
			startTime: new Date('2026-09-24T08:00:00.000Z'),
			endTime: new Date('2026-09-24T09:00:00.000Z'),
			vehicleId,
		});
		prismaMock.lesson.findFirst.mockResolvedValue({
			id: lessonId,
			status: 'SCHEDULED',
			studentId: 'student-1',
			instructorId,
			vehicleId,
			startTime: new Date('2099-09-26T08:00:00.000Z'),
			endTime: new Date('2099-09-26T09:00:00.000Z'),
			course: {
				id: 'course-1',
				schoolId: 'school-1',
				instructorId: null,
				courseTypeId: 'course-type-1',
				kind: 'PRACTICAL',
				totalHours: 30,
			},
		});
		prismaMock.instructorSchool.findFirst.mockResolvedValue({
			id: 'link-1',
		});
		prismaMock.vehicle.findFirst.mockResolvedValue({ id: vehicleId });
	});

	it('checks the instructor window before a drive vehicle is selected', async () => {
		await expect(
			checkScheduleAvailability(actor, {
				intent: 'event_create',
				instructorId,
				eventType: EventType.DRIVE,
				date: '2026-09-24',
				startTime: '10:00',
				endTime: '11:00',
			}),
		).resolves.toEqual({
			available: true,
			issues: [],
			policy: { minDurationMinutes: 60, maxDurationMinutes: 120 },
		});
		expect(mocks.validateVehicleForInstructor).not.toHaveBeenCalled();
		expect(
			mocks.assertVehicleAvailableForEventWindow,
		).not.toHaveBeenCalled();
	});

	it('returns available with the policy for a free candidate', async () => {
		await expect(
			checkScheduleAvailability(actor, {
				intent: 'event_create',
				instructorId,
				eventType: EventType.DRIVE,
				date: '2026-09-24',
				startTime: '10:00',
				endTime: '11:00',
				vehicleId,
			}),
		).resolves.toEqual({
			available: true,
			issues: [],
			policy: { minDurationMinutes: 60, maxDurationMinutes: 120 },
		});
	});

	it('returns field issues for duration, instructor and vehicle conflicts', async () => {
		mocks.assertInstructorEventWindowAvailable.mockRejectedValue(
			ScheduleDomainError.conflictFor('INSTRUCTOR_BUSY', 'busy'),
		);
		mocks.assertVehicleAvailableForEventWindow.mockRejectedValue(
			ScheduleDomainError.conflictFor('VEHICLE_BUSY', 'busy'),
		);

		const result = await checkScheduleAvailability(actor, {
			intent: 'event_create',
			instructorId,
			eventType: EventType.DRIVE,
			date: '2026-09-24',
			startTime: '10:00',
			endTime: '10:30',
			vehicleId,
		});

		expect(result.available).toBe(false);
		expect(result.issues).toEqual([
			{ code: 'DURATION_TOO_SHORT', field: 'endTime' },
			{ code: 'INSTRUCTOR_BUSY', field: 'instructorId' },
			{ code: 'VEHICLE_BUSY', field: 'vehicleId' },
		]);
	});

	it('distinguishes a slot outside instructor working hours from a collision', async () => {
		mocks.assertInstructorEventWindowAvailable.mockRejectedValue(
			ScheduleDomainError.conflictFor(
				'OUTSIDE_INSTRUCTOR_HOURS',
				'Slot outside instructor availability',
			),
		);

		const result = await checkScheduleAvailability(actor, {
			intent: 'event_create',
			instructorId,
			eventType: EventType.DRIVE,
			date: '2026-09-26',
			startTime: '10:00',
			endTime: '11:00',
		});

		expect(result.issues).toEqual([
			{ code: 'OUTSIDE_INSTRUCTOR_HOURS', field: 'instructorId' },
		]);
	});

	it('checks theory course eligibility without running vehicle rules', async () => {
		mocks.assertCourseEligibleForInstructorEvent.mockRejectedValue(
			AppError.badRequest('Instructor is not qualified for this course'),
		);

		const result = await checkScheduleAvailability(actor, {
			intent: 'event_create',
			instructorId,
			eventType: EventType.THEORY,
			courseId,
			date: '2026-09-24',
			startTime: '10:00',
			endTime: '11:00',
		});

		expect(result).toEqual({
			available: false,
			issues: [{ code: 'COURSE_NOT_ELIGIBLE', field: 'courseId' }],
			policy: { minDurationMinutes: 45, maxDurationMinutes: 90 },
		});
		expect(mocks.validateVehicleForInstructor).not.toHaveBeenCalled();
		expect(
			mocks.assertVehicleAvailableForEventWindow,
		).not.toHaveBeenCalled();
	});

	it('does not turn unexpected infrastructure errors into availability issues', async () => {
		mocks.assertInstructorEventWindowAvailable.mockRejectedValue(
			new Error('database offline'),
		);

		await expect(
			checkScheduleAvailability(actor, {
				intent: 'event_create',
				instructorId,
				eventType: EventType.THEORY,
				date: '2026-09-24',
				startTime: '10:00',
				endTime: '11:00',
			}),
		).rejects.toThrow('database offline');
	});

	it('classifies an instructor conflict by reason even when its message changes', async () => {
		mocks.assertInstructorEventWindowAvailable.mockRejectedValue(
			ScheduleDomainError.conflictFor(
				'OUTSIDE_INSTRUCTOR_HOURS',
				'new wording',
			),
		);

		const result = await checkScheduleAvailability(actor, {
			intent: 'event_create',
			instructorId,
			eventType: EventType.THEORY,
			date: '2026-09-24',
			startTime: '10:00',
			endTime: '11:00',
		});

		expect(result.issues).toEqual([
			{ code: 'OUTSIDE_INSTRUCTOR_HOURS', field: 'instructorId' },
		]);
	});

	it('does not turn an internal AppError into a busy instructor issue', async () => {
		mocks.assertInstructorEventWindowAvailable.mockRejectedValue(
			AppError.internal('database offline'),
		);

		await expect(
			checkScheduleAvailability(actor, {
				intent: 'event_create',
				instructorId,
				eventType: EventType.THEORY,
				date: '2026-09-24',
				startTime: '10:00',
				endTime: '11:00',
			}),
		).rejects.toMatchObject({
			statusCode: 500,
			message: 'database offline',
		});
	});

	it.each([
		['STUDENT_BUSY', 'studentId'],
		['COURSE_LIMIT_EXCEEDED', 'courseId'],
		['INSTRUCTOR_BUSY', 'instructorId'],
		['OUTSIDE_INSTRUCTOR_HOURS', 'instructorId'],
	] as const)(
		'maps %s independently of the error message',
		async (reason, field) => {
			mocks.assertLessonSchedulingWindowAvailable.mockRejectedValue(
				ScheduleDomainError.conflictFor(reason, 'changed message'),
			);

			const result = await checkScheduleAvailability(actor, {
				intent: 'lesson_create',
				courseId,
				studentId,
				instructorId,
				vehicleId,
				date: '2026-09-26',
				startTime: '12:00',
				endTime: '13:00',
			});

			expect(result.issues).toContainEqual({ code: reason, field });
		},
	);

	it('keeps vehicle and participant conflicts separate from infrastructure errors', async () => {
		mocks.assertInstructorEventWindowAvailable.mockRejectedValue(
			ScheduleDomainError.conflictFor(
				'PARTICIPANT_BUSY',
				'changed message',
			),
		);
		mocks.assertVehicleAvailableForEventWindow.mockRejectedValue(
			ScheduleDomainError.conflictFor('VEHICLE_BUSY', 'changed message'),
		);

		const result = await checkScheduleAvailability(actor, {
			intent: 'event_edit',
			eventId,
			instructorId,
			date: '2026-09-24',
			startTime: '11:00',
			endTime: '12:00',
			vehicleId,
		});

		expect(result.issues).toEqual([
			{ code: 'PARTICIPANT_BUSY', field: 'instructorId' },
			{ code: 'VEHICLE_BUSY', field: 'vehicleId' },
		]);

		mocks.assertVehicleAvailableForEventWindow.mockRejectedValue(
			AppError.internal('database offline'),
		);
		await expect(
			checkScheduleAvailability(actor, {
				intent: 'event_edit',
				eventId,
				instructorId,
				date: '2026-09-24',
				startTime: '11:00',
				endTime: '12:00',
				vehicleId,
			}),
		).rejects.toMatchObject({
			statusCode: 500,
			message: 'database offline',
		});
	});

	it('treats an unchanged event edit as available without conflict checks', async () => {
		await expect(
			checkScheduleAvailability(actor, {
				intent: 'event_edit',
				eventId,
				instructorId,
				date: '2026-09-24',
				startTime: '10:00',
				endTime: '11:00',
				vehicleId,
			}),
		).resolves.toEqual({
			available: true,
			issues: [],
			policy: { minDurationMinutes: 60, maxDurationMinutes: 120 },
		});

		expect(
			mocks.assertInstructorEventWindowAvailable,
		).not.toHaveBeenCalled();
		expect(
			mocks.assertVehicleAvailableForEventWindow,
		).not.toHaveBeenCalled();
		expect(mocks.validateVehicleForInstructor).not.toHaveBeenCalled();
	});

	it('excludes the edited event while checking a changed window', async () => {
		await checkScheduleAvailability(actor, {
			intent: 'event_edit',
			eventId,
			instructorId,
			date: '2026-09-24',
			startTime: '11:00',
			endTime: '12:00',
			vehicleId,
		});

		expect(mocks.assertInstructorEventWindowAvailable).toHaveBeenCalledWith(
			prismaMock,
			expect.objectContaining({
				eventId,
				checkExistingParticipantsForEventId: eventId,
			}),
		);
		expect(mocks.assertVehicleAvailableForEventWindow).toHaveBeenCalledWith(
			prismaMock,
			expect.objectContaining({ eventId, vehicleId }),
		);
	});

	it('treats an unchanged lesson edit as available', async () => {
		await expect(
			checkScheduleAvailability(actor, {
				intent: 'lesson_edit',
				lessonId,
				instructorId,
				vehicleId,
				date: '2099-09-26',
				startTime: '10:00',
				endTime: '11:00',
			}),
		).resolves.toEqual({
			available: true,
			issues: [],
			policy: { minDurationMinutes: 60, maxDurationMinutes: 120 },
		});

		expect(
			mocks.assertLessonSchedulingWindowAvailable,
		).not.toHaveBeenCalled();
		expect(mocks.vehicleHasBookingConflict).not.toHaveBeenCalled();
	});

	it('excludes the edited lesson from schedule and vehicle checks', async () => {
		await checkScheduleAvailability(actor, {
			intent: 'lesson_edit',
			lessonId,
			instructorId,
			vehicleId,
			date: '2099-09-26',
			startTime: '11:00',
			endTime: '12:00',
		});

		expect(
			mocks.assertLessonSchedulingWindowAvailable,
		).toHaveBeenCalledWith(
			prismaMock,
			expect.objectContaining({ excludeLessonId: lessonId }),
		);
		expect(mocks.vehicleHasBookingConflict).toHaveBeenCalledWith(
			prismaMock,
			vehicleId,
			expect.any(Date),
			expect.any(Date),
			{ excludeLessonId: lessonId },
		);
	});

	it('allows a different qualified instructor on one lesson with a course instructor assigned', async () => {
		const substituteId = '99999999-9999-4999-8999-999999999999';
		const result = await checkScheduleAvailability(actor, {
			intent: 'lesson_edit',
			lessonId,
			instructorId: substituteId,
			vehicleId,
			date: '2099-09-26',
			startTime: '10:00',
			endTime: '11:00',
		});
		expect(result.available).toBe(true);
		expect(
			mocks.assertInstructorQualifiedForCourseType,
		).toHaveBeenCalledWith(substituteId, 'course-type-1');
		expect(
			mocks.assertLessonSchedulingWindowAvailable,
		).toHaveBeenCalledWith(
			prismaMock,
			expect.objectContaining({
				instructorId: substituteId,
				excludeLessonId: lessonId,
			}),
		);
	});

	it('returns lesson-specific issues for an unavailable changed window', async () => {
		mocks.assertLessonTimeIsBookable.mockRejectedValue(
			ScheduleDomainError.badRequestFor(
				'DATE_NOT_BOOKABLE',
				'Lesson date is outside the booking window',
			),
		);
		mocks.validateVehicleForInstructor.mockRejectedValue(
			ScheduleDomainError.badRequestFor(
				'VEHICLE_UNAVAILABLE',
				'Vehicle is unavailable',
			),
		);
		mocks.assertLessonSchedulingWindowAvailable.mockRejectedValue(
			ScheduleDomainError.conflictFor(
				'STUDENT_BUSY',
				'Student has another lesson at this time',
			),
		);
		mocks.vehicleHasBookingConflict.mockResolvedValue(true);

		const result = await checkScheduleAvailability(actor, {
			intent: 'lesson_edit',
			lessonId,
			instructorId,
			vehicleId,
			date: '2099-09-26',
			startTime: '11:00',
			endTime: '11:30',
		});

		expect(result.available).toBe(false);
		expect(result.issues).toEqual([
			{ code: 'DURATION_TOO_SHORT', field: 'endTime' },
			{ code: 'DATE_NOT_BOOKABLE', field: 'date' },
			{ code: 'VEHICLE_UNAVAILABLE', field: 'vehicleId' },
			{ code: 'STUDENT_BUSY', field: 'studentId' },
			{ code: 'VEHICLE_BUSY', field: 'vehicleId' },
		]);
	});

	it('checks the manager lesson candidate with the selected vehicle', async () => {
		await expect(
			checkScheduleAvailability(actor, {
				intent: 'lesson_create',
				courseId,
				studentId,
				instructorId,
				vehicleId,
				date: '2026-09-26',
				startTime: '12:00',
				endTime: '13:00',
			}),
		).resolves.toEqual({
			available: true,
			issues: [],
			policy: { minDurationMinutes: 60, maxDurationMinutes: 120 },
		});

		expect(mocks.assertStudentParticipatesInCourse).toHaveBeenCalledWith(
			courseId,
			studentProfileId,
		);
		expect(mocks.assertVehicleAvailableForBooking).toHaveBeenCalledWith(
			prismaMock,
			instructorId,
			vehicleId,
			'school-1',
			expect.any(Date),
			expect.any(Date),
		);
	});

	it('checks self-booking with server-side vehicle selection', async () => {
		await expect(
			checkScheduleAvailability(
				{ id: studentId, role: Role.STUDENT },
				{
					intent: 'lesson_self_book',
					courseId,
					instructorId,
					date: '2026-09-26',
					startTime: '12:00',
					endTime: '13:00',
				},
			),
		).resolves.toEqual({
			available: true,
			issues: [],
			policy: { minDurationMinutes: 60, maxDurationMinutes: 120 },
		});

		expect(mocks.assertStudentParticipatesInCourse).toHaveBeenCalledWith(
			courseId,
			studentProfileId,
			{ requireActive: true },
		);
		expect(
			mocks.findAvailableVehicleIdForStudentBooking,
		).toHaveBeenCalledWith(
			prismaMock,
			instructorId,
			'school-1',
			expect.any(Date),
			expect.any(Date),
		);
	});

	it('reports when self-booking has no vehicle available', async () => {
		mocks.findAvailableVehicleIdForStudentBooking.mockRejectedValue(
			ScheduleDomainError.conflictFor(
				'NO_VEHICLE_AVAILABLE',
				'No available vehicle for this time slot',
			),
		);

		const result = await checkScheduleAvailability(
			{ id: studentId, role: Role.STUDENT },
			{
				intent: 'lesson_self_book',
				courseId,
				instructorId,
				date: '2026-09-26',
				startTime: '12:00',
				endTime: '13:00',
			},
		);

		expect(result).toMatchObject({
			available: false,
			issues: [{ code: 'NO_VEHICLE_AVAILABLE', field: 'vehicleId' }],
		});
	});
});
