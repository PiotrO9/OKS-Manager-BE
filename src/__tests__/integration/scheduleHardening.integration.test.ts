import {
	CourseKind,
	EventStatus,
	EventType,
	LessonStatus,
	LessonType,
	Role,
	VehicleAvailabilityStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '../../lib/prisma';
import {
	polishLocalDateTimeToDate,
	polishTodayYyyymmdd,
} from '../../lib/polishScheduleTime';
import { createInstructorEvent } from '../../services/event/writeModel';
import { replaceEventStudents } from '../../services/event/participants';
import { bookLesson, bookOwnLesson } from '../../services/lesson/bookingRules';
import { updateLesson } from '../../services/lesson/writeModel';
import { getLessonInstructorOptions } from '../../services/lesson/instructorOptions';
import { checkScheduleAvailability } from '../../services/schedule-validation/check';

const prisma = getPrisma();
const suffix = randomUUID();
const ids = {
	managerUserId: randomUUID(),
	instructorUserId: randomUUID(),
	secondInstructorUserId: randomUUID(),
	studentUserId: randomUUID(),
	secondStudentUserId: randomUUID(),
	foreignManagerUserId: randomUUID(),
	foreignInstructorUserId: randomUUID(),
	foreignStudentUserId: randomUUID(),
	instructorId: randomUUID(),
	secondInstructorId: randomUUID(),
	studentId: randomUUID(),
	secondStudentId: randomUUID(),
	foreignInstructorId: randomUUID(),
	foreignStudentId: randomUUID(),
	schoolId: randomUUID(),
	foreignSchoolId: randomUUID(),
	courseTypeId: randomUUID(),
	courseId: randomUUID(),
	vehicleId: randomUUID(),
	secondVehicleId: randomUUID(),
	foreignVehicleId: randomUUID(),
};
const actor = { id: ids.managerUserId, role: Role.MANAGER };
const testDate = addDays(polishTodayYyyymmdd(), 2);
const raceDate = addDays(testDate, 1);
const earlyCheckDate = addDays(testDate, 2);

function addDays(date: string, days: number): string {
	const value = new Date(`${date}T12:00:00.000Z`);
	value.setUTCDate(value.getUTCDate() + days);
	return value.toISOString().slice(0, 10);
}

function instant(time: string, date = testDate): Date {
	return polishLocalDateTimeToDate(date, time);
}

function iso(time: string, date = testDate): string {
	return instant(time, date).toISOString();
}

function lessonPayload(
	startTime: string,
	endTime: string,
	overrides: Partial<{
		studentId: string;
		instructorId: string;
		vehicleId: string;
		date: string;
	}> = {},
) {
	return {
		courseId: ids.courseId,
		studentId: overrides.studentId ?? ids.studentUserId,
		instructorId: overrides.instructorId ?? ids.instructorId,
		startTime: iso(startTime, overrides.date),
		endTime: iso(endTime, overrides.date),
		lessonType: LessonType.PRACTICE,
		vehicleId: overrides.vehicleId ?? ids.vehicleId,
	};
}

function eventPayload(
	startTime: string,
	endTime: string,
	overrides: Partial<{
		instructorId: string;
		vehicleId: string;
		type: EventType;
		date: string;
	}> = {},
) {
	const type = overrides.type ?? EventType.DRIVE;
	return {
		instructorId: overrides.instructorId ?? ids.instructorId,
		type,
		startTime: iso(startTime, overrides.date),
		endTime: iso(endTime, overrides.date),
		...(type === EventType.DRIVE
			? { vehicleId: overrides.vehicleId ?? ids.vehicleId }
			: {}),
	};
}

describe('schedule write hardening with PostgreSQL', () => {
	beforeAll(async () => {
		await prisma.user.createMany({
			data: [
				{
					id: ids.managerUserId,
					firstName: 'Hardening',
					lastName: 'Manager',
					email: `hardening-manager-${suffix}@example.test`,
					role: Role.MANAGER,
				},
				{
					id: ids.instructorUserId,
					firstName: 'First',
					lastName: 'Instructor',
					email: `hardening-instructor-1-${suffix}@example.test`,
					role: Role.INSTRUCTOR,
				},
				{
					id: ids.secondInstructorUserId,
					firstName: 'Second',
					lastName: 'Instructor',
					email: `hardening-instructor-2-${suffix}@example.test`,
					role: Role.INSTRUCTOR,
				},
				{
					id: ids.studentUserId,
					firstName: 'First',
					lastName: 'Student',
					email: `hardening-student-1-${suffix}@example.test`,
					role: Role.STUDENT,
				},
				{
					id: ids.secondStudentUserId,
					firstName: 'Second',
					lastName: 'Student',
					email: `hardening-student-2-${suffix}@example.test`,
					role: Role.STUDENT,
				},
				{
					id: ids.foreignManagerUserId,
					firstName: 'Foreign',
					lastName: 'Manager',
					email: `hardening-foreign-manager-${suffix}@example.test`,
					role: Role.MANAGER,
				},
				{
					id: ids.foreignInstructorUserId,
					firstName: 'Foreign',
					lastName: 'Instructor',
					email: `hardening-foreign-instructor-${suffix}@example.test`,
					role: Role.INSTRUCTOR,
				},
				{
					id: ids.foreignStudentUserId,
					firstName: 'Foreign',
					lastName: 'Student',
					email: `hardening-foreign-student-${suffix}@example.test`,
					role: Role.STUDENT,
				},
			],
		});
		await prisma.drivingSchool.createMany({
			data: [
				{
					id: ids.schoolId,
					name: `Hardening school ${suffix}`,
					ownerId: ids.managerUserId,
				},
				{
					id: ids.foreignSchoolId,
					name: `Foreign hardening school ${suffix}`,
					ownerId: ids.foreignManagerUserId,
				},
			],
		});
		await prisma.schoolSettings.create({
			data: {
				schoolId: ids.schoolId,
				practiceMinDurationMinutes: 60,
				practiceMaxDurationMinutes: 120,
				theoryMinDurationMinutes: 45,
				theoryMaxDurationMinutes: 90,
				bookingMaxDaysAhead: 30,
				workingDaysMask: 127,
			},
		});
		await prisma.courseType.create({
			data: {
				id: ids.courseTypeId,
				code: `HARD-${suffix}`,
				name: `Hardening type ${suffix}`,
			},
		});
		await prisma.instructorProfile.createMany({
			data: [
				{
					id: ids.instructorId,
					userId: ids.instructorUserId,
					licenseNumber: `HARD-1-${suffix}`,
				},
				{
					id: ids.secondInstructorId,
					userId: ids.secondInstructorUserId,
					licenseNumber: `HARD-2-${suffix}`,
				},
				{
					id: ids.foreignInstructorId,
					userId: ids.foreignInstructorUserId,
					licenseNumber: `HARD-FOREIGN-${suffix}`,
				},
			],
		});
		await prisma.instructorProfile.update({
			where: { id: ids.instructorId },
			data: {
				qualifiedCourseTypes: { connect: { id: ids.courseTypeId } },
			},
		});
		await prisma.instructorProfile.update({
			where: { id: ids.secondInstructorId },
			data: {
				qualifiedCourseTypes: { connect: { id: ids.courseTypeId } },
			},
		});
		await prisma.studentProfile.createMany({
			data: [
				{ id: ids.studentId, userId: ids.studentUserId },
				{ id: ids.secondStudentId, userId: ids.secondStudentUserId },
				{ id: ids.foreignStudentId, userId: ids.foreignStudentUserId },
			],
		});
		await prisma.instructorSchool.createMany({
			data: [
				{ instructorId: ids.instructorId, schoolId: ids.schoolId },
				{
					instructorId: ids.secondInstructorId,
					schoolId: ids.schoolId,
				},
				{
					instructorId: ids.foreignInstructorId,
					schoolId: ids.foreignSchoolId,
				},
			],
		});
		await prisma.studentSchool.createMany({
			data: [
				{ studentId: ids.studentId, schoolId: ids.schoolId },
				{ studentId: ids.secondStudentId, schoolId: ids.schoolId },
				{
					studentId: ids.foreignStudentId,
					schoolId: ids.foreignSchoolId,
				},
			],
		});
		await prisma.instructorWorkingHoursDefault.createMany({
			data: [
				ids.instructorId,
				ids.secondInstructorId,
				ids.foreignInstructorId,
			].flatMap((instructorId) =>
				Array.from({ length: 7 }, (_, dayOfWeek) => ({
					instructorId,
					dayOfWeek,
					startTime: new Date('1970-01-01T06:00:00.000Z'),
					endTime: new Date('1970-01-01T22:00:00.000Z'),
				})),
			),
		});
		await prisma.vehicle.createMany({
			data: [
				{
					id: ids.vehicleId,
					schoolId: ids.schoolId,
					name: 'Hardening vehicle 1',
					registrationNumber: `HARD-1-${suffix}`,
				},
				{
					id: ids.secondVehicleId,
					schoolId: ids.schoolId,
					name: 'Hardening vehicle 2',
					registrationNumber: `HARD-2-${suffix}`,
				},
				{
					id: ids.foreignVehicleId,
					schoolId: ids.foreignSchoolId,
					name: 'Foreign hardening vehicle',
					registrationNumber: `HARD-F-${suffix}`,
				},
			],
		});
		await prisma.course.create({
			data: {
				id: ids.courseId,
				schoolId: ids.schoolId,
				name: `Hardening course ${suffix}`,
				category: 'B',
				courseTypeId: ids.courseTypeId,
				kind: CourseKind.PRACTICAL,
				totalHours: 30,
			},
		});
		await prisma.courseParticipant.createMany({
			data: [
				{ courseId: ids.courseId, studentId: ids.studentId },
				{ courseId: ids.courseId, studentId: ids.secondStudentId },
			],
		});
	});

	afterAll(async () => {
		await prisma.eventParticipant.deleteMany({
			where: {
				event: {
					schoolId: { in: [ids.schoolId, ids.foreignSchoolId] },
				},
			},
		});
		await prisma.lesson.deleteMany({ where: { courseId: ids.courseId } });
		await prisma.instructorEvent.deleteMany({
			where: { schoolId: ids.schoolId },
		});
		await prisma.courseParticipant.deleteMany({
			where: { courseId: ids.courseId },
		});
		await prisma.course.deleteMany({ where: { id: ids.courseId } });
		await prisma.vehicle.deleteMany({
			where: { schoolId: { in: [ids.schoolId, ids.foreignSchoolId] } },
		});
		await prisma.instructorWorkingHoursDefault.deleteMany({
			where: {
				instructorId: {
					in: [
						ids.instructorId,
						ids.secondInstructorId,
						ids.foreignInstructorId,
					],
				},
			},
		});
		await prisma.studentSchool.deleteMany({
			where: {
				schoolId: { in: [ids.schoolId, ids.foreignSchoolId] },
			},
		});
		await prisma.instructorSchool.deleteMany({
			where: {
				schoolId: { in: [ids.schoolId, ids.foreignSchoolId] },
			},
		});
		await prisma.studentProfile.deleteMany({
			where: {
				id: {
					in: [
						ids.studentId,
						ids.secondStudentId,
						ids.foreignStudentId,
					],
				},
			},
		});
		await prisma.instructorProfile.deleteMany({
			where: {
				id: {
					in: [
						ids.instructorId,
						ids.secondInstructorId,
						ids.foreignInstructorId,
					],
				},
			},
		});
		await prisma.schoolSettings.deleteMany({
			where: { schoolId: ids.schoolId },
		});
		await prisma.drivingSchool.deleteMany({
			where: { id: { in: [ids.schoolId, ids.foreignSchoolId] } },
		});
		await prisma.courseType.deleteMany({ where: { id: ids.courseTypeId } });
		await prisma.user.deleteMany({
			where: {
				id: {
					in: [
						ids.managerUserId,
						ids.instructorUserId,
						ids.secondInstructorUserId,
						ids.studentUserId,
						ids.secondStudentUserId,
						ids.foreignManagerUserId,
						ids.foreignInstructorUserId,
						ids.foreignStudentUserId,
					],
				},
			},
		});
		await prisma.$disconnect();
	});

	it('allows an event to start exactly when an existing lesson ends', async () => {
		await prisma.lesson.create({
			data: {
				courseId: ids.courseId,
				studentId: ids.studentId,
				instructorId: ids.instructorId,
				vehicleId: ids.vehicleId,
				lessonType: LessonType.PRACTICE,
				startTime: instant('07:00'),
				endTime: instant('08:00'),
			},
		});

		await expect(
			createInstructorEvent(actor, eventPayload('08:00', '09:00')),
		).resolves.toEqual(
			expect.objectContaining({
				event: expect.objectContaining({ type: EventType.DRIVE }),
			}),
		);
	});

	it('rejects a lesson overlapping an instructor event', async () => {
		await createInstructorEvent(actor, eventPayload('09:00', '10:00'));

		await expect(
			bookLesson(actor, lessonPayload('09:00', '10:00')),
		).rejects.toMatchObject({ statusCode: 409 });
	});

	it('reports an instructor conflict but allows an adjacent window', async () => {
		await prisma.lesson.create({
			data: {
				courseId: ids.courseId,
				studentId: ids.studentId,
				instructorId: ids.instructorId,
				vehicleId: ids.vehicleId,
				lessonType: LessonType.PRACTICE,
				startTime: instant('09:00', earlyCheckDate),
				endTime: instant('10:00', earlyCheckDate),
			},
		});

		await expect(
			checkScheduleAvailability(actor, {
				intent: 'event_create',
				instructorId: ids.instructorId,
				eventType: EventType.DRIVE,
				date: earlyCheckDate,
				startTime: '09:00',
				endTime: '10:00',
			}),
		).resolves.toEqual({
			available: false,
			issues: [{ code: 'INSTRUCTOR_BUSY', field: 'instructorId' }],
			policy: { minDurationMinutes: 60, maxDurationMinutes: 120 },
		});

		await expect(
			checkScheduleAvailability(actor, {
				intent: 'event_create',
				instructorId: ids.instructorId,
				eventType: EventType.DRIVE,
				date: earlyCheckDate,
				startTime: '10:00',
				endTime: '11:00',
			}),
		).resolves.toEqual({
			available: true,
			issues: [],
			policy: { minDurationMinutes: 60, maxDurationMinutes: 120 },
		});
	});

	it('reports an instructor conflict for another student booking a lesson', async () => {
		await prisma.lesson.create({
			data: {
				courseId: ids.courseId,
				studentId: ids.studentId,
				instructorId: ids.instructorId,
				vehicleId: ids.vehicleId,
				lessonType: LessonType.PRACTICE,
				startTime: instant('12:00', earlyCheckDate),
				endTime: instant('13:00', earlyCheckDate),
			},
		});

		await expect(
			checkScheduleAvailability(actor, {
				intent: 'lesson_create',
				courseId: ids.courseId,
				studentId: ids.secondStudentUserId,
				instructorId: ids.instructorId,
				vehicleId: ids.secondVehicleId,
				date: earlyCheckDate,
				startTime: '12:00',
				endTime: '13:00',
			}),
		).resolves.toEqual({
			available: false,
			issues: [{ code: 'INSTRUCTOR_BUSY', field: 'instructorId' }],
			policy: { minDurationMinutes: 60, maxDurationMinutes: 120 },
		});
	});

	it('ignores a cancelled lesson when creating an event', async () => {
		await prisma.lesson.create({
			data: {
				courseId: ids.courseId,
				studentId: ids.studentId,
				instructorId: ids.instructorId,
				vehicleId: ids.vehicleId,
				lessonType: LessonType.PRACTICE,
				status: LessonStatus.CANCELLED,
				startTime: instant('10:00'),
				endTime: instant('11:00'),
			},
		});

		await expect(
			createInstructorEvent(actor, eventPayload('10:00', '11:00')),
		).resolves.toBeDefined();
	});

	it('ignores an inactive event when booking a lesson', async () => {
		await prisma.instructorEvent.create({
			data: {
				instructorId: ids.instructorId,
				schoolId: ids.schoolId,
				vehicleId: ids.vehicleId,
				type: EventType.DRIVE,
				isActive: false,
				startTime: instant('11:00'),
				endTime: instant('12:00'),
			},
		});

		await expect(
			bookLesson(actor, lessonPayload('11:00', '12:00')),
		).resolves.toBeDefined();
	});

	it('rejects the same instructor even when a different vehicle is selected', async () => {
		await createInstructorEvent(actor, eventPayload('12:00', '13:00'));

		await expect(
			createInstructorEvent(
				actor,
				eventPayload('12:00', '13:00', {
					vehicleId: ids.secondVehicleId,
				}),
			),
		).rejects.toMatchObject({ statusCode: 409 });
	});

	it('rejects the same vehicle even when a different instructor is selected', async () => {
		await createInstructorEvent(actor, eventPayload('13:00', '14:00'));

		await expect(
			createInstructorEvent(
				actor,
				eventPayload('13:00', '14:00', {
					instructorId: ids.secondInstructorId,
				}),
			),
		).rejects.toMatchObject({ statusCode: 409 });
	});

	it('allows exactly one of two concurrent lessons', async () => {
		const results = await Promise.allSettled([
			bookLesson(actor, lessonPayload('14:00', '15:00')),
			bookLesson(actor, lessonPayload('14:00', '15:00')),
		]);

		expect(
			results.filter((result) => result.status === 'fulfilled'),
		).toHaveLength(1);
		expect(
			results.filter((result) => result.status === 'rejected'),
		).toHaveLength(1);
	});

	it('allows exactly one concurrent lesson or event for the same resources', async () => {
		const results = await Promise.allSettled([
			bookLesson(actor, lessonPayload('15:00', '16:00')),
			createInstructorEvent(actor, eventPayload('15:00', '16:00')),
		]);

		expect(
			results.filter((result) => result.status === 'fulfilled'),
		).toHaveLength(1);
		expect(
			results.filter((result) => result.status === 'rejected'),
		).toHaveLength(1);
	});

	it('rejects adding a participant who has an overlapping lesson', async () => {
		const theory = await createInstructorEvent(
			actor,
			eventPayload('16:00', '17:00', { type: EventType.THEORY }),
		);
		await prisma.lesson.create({
			data: {
				courseId: ids.courseId,
				studentId: ids.studentId,
				instructorId: ids.secondInstructorId,
				vehicleId: ids.secondVehicleId,
				lessonType: LessonType.PRACTICE,
				startTime: instant('16:00'),
				endTime: instant('17:00'),
			},
		});

		await expect(
			replaceEventStudents(actor, theory.event.id, {
				studentIds: [ids.studentUserId],
			}),
		).rejects.toMatchObject({ statusCode: 409 });
		await expect(
			prisma.eventParticipant.count({
				where: { eventId: theory.event.id },
			}),
		).resolves.toBe(0);
	});

	it('does not partially replace participants when capacity is exceeded', async () => {
		const theory = await createInstructorEvent(actor, {
			...eventPayload('17:00', '18:00', { type: EventType.THEORY }),
			capacity: 1,
		});

		await expect(
			replaceEventStudents(actor, theory.event.id, {
				studentIds: [ids.studentUserId, ids.secondStudentUserId],
			}),
		).rejects.toMatchObject({ statusCode: 409 });
		await expect(
			prisma.eventParticipant.count({
				where: { eventId: theory.event.id },
			}),
		).resolves.toBe(0);
	});

	it('does not let a manager schedule an instructor from another school', async () => {
		await expect(
			createInstructorEvent(
				actor,
				eventPayload('13:00', '14:00', {
					instructorId: ids.foreignInstructorId,
					vehicleId: ids.foreignVehicleId,
					date: raceDate,
				}),
			),
		).rejects.toMatchObject({ statusCode: 403 });
	});

	it('does not let an event use a vehicle from another school', async () => {
		await expect(
			createInstructorEvent(
				actor,
				eventPayload('13:00', '14:00', {
					vehicleId: ids.foreignVehicleId,
					date: raceDate,
				}),
			),
		).rejects.toMatchObject({ statusCode: 400 });
	});

	it('does not let a theory event include a student from another school', async () => {
		const theory = await createInstructorEvent(
			actor,
			eventPayload('14:00', '15:00', {
				type: EventType.THEORY,
				date: raceDate,
			}),
		);

		await expect(
			replaceEventStudents(actor, theory.event.id, {
				studentIds: [ids.foreignStudentUserId],
			}),
		).rejects.toMatchObject({ statusCode: 422 });
	});

	it('allows exactly one concurrent participant assignment or lesson', async () => {
		const theory = await createInstructorEvent(
			actor,
			eventPayload('07:00', '08:00', {
				type: EventType.THEORY,
				date: raceDate,
			}),
		);

		const results = await Promise.allSettled([
			replaceEventStudents(actor, theory.event.id, {
				studentIds: [ids.studentUserId],
			}),
			bookLesson(
				actor,
				lessonPayload('07:00', '08:00', {
					instructorId: ids.secondInstructorId,
					vehicleId: ids.secondVehicleId,
					date: raceDate,
				}),
			),
		]);

		expect(
			results.filter((result) => result.status === 'fulfilled'),
		).toHaveLength(1);
		expect(
			results.filter((result) => result.status === 'rejected'),
		).toHaveLength(1);
		const [participantCount, lessonCount] = await Promise.all([
			prisma.eventParticipant.count({
				where: { eventId: theory.event.id, studentId: ids.studentId },
			}),
			prisma.lesson.count({
				where: {
					studentId: ids.studentId,
					startTime: instant('07:00', raceDate),
				},
			}),
		]);
		expect(participantCount + lessonCount).toBe(1);
	});

	it('allows exactly one concurrent lesson edit or conflicting event creation', async () => {
		const lesson = await prisma.lesson.create({
			data: {
				courseId: ids.courseId,
				studentId: ids.secondStudentId,
				instructorId: ids.instructorId,
				vehicleId: ids.vehicleId,
				lessonType: LessonType.PRACTICE,
				startTime: instant('08:00', raceDate),
				endTime: instant('09:00', raceDate),
			},
		});

		const results = await Promise.allSettled([
			updateLesson(actor, lesson.id, {
				startTime: iso('09:00', raceDate),
				endTime: iso('10:00', raceDate),
			}),
			createInstructorEvent(
				actor,
				eventPayload('09:00', '10:00', { date: raceDate }),
			),
		]);

		expect(
			results.filter((result) => result.status === 'fulfilled'),
		).toHaveLength(1);
		expect(
			results.filter((result) => result.status === 'rejected'),
		).toHaveLength(1);
		const [lessonCount, eventCount] = await Promise.all([
			prisma.lesson.count({
				where: {
					id: lesson.id,
					startTime: instant('09:00', raceDate),
				},
			}),
			prisma.instructorEvent.count({
				where: {
					instructorId: ids.instructorId,
					startTime: instant('09:00', raceDate),
				},
			}),
		]);
		expect(lessonCount + eventCount).toBe(1);
	});

	it('allows exactly one concurrent self-booking when only one vehicle is available', async () => {
		await prisma.vehicle.update({
			where: { id: ids.secondVehicleId },
			data: { availabilityStatus: VehicleAvailabilityStatus.UNAVAILABLE },
		});

		try {
			const results = await Promise.allSettled([
				bookOwnLesson(
					{ id: ids.studentUserId, role: Role.STUDENT },
					{
						courseId: ids.courseId,
						instructorId: ids.instructorId,
						startTime: iso('10:00', raceDate),
						endTime: iso('11:00', raceDate),
					},
				),
				bookOwnLesson(
					{ id: ids.secondStudentUserId, role: Role.STUDENT },
					{
						courseId: ids.courseId,
						instructorId: ids.secondInstructorId,
						startTime: iso('10:00', raceDate),
						endTime: iso('11:00', raceDate),
					},
				),
			]);

			expect(
				results.filter((result) => result.status === 'fulfilled'),
			).toHaveLength(1);
			expect(
				results.filter((result) => result.status === 'rejected'),
			).toHaveLength(1);
			await expect(
				prisma.lesson.count({
					where: {
						vehicleId: ids.vehicleId,
						startTime: instant('10:00', raceDate),
					},
				}),
			).resolves.toBe(1);
		} finally {
			await prisma.vehicle.update({
				where: { id: ids.secondVehicleId },
				data: { availabilityStatus: VehicleAvailabilityStatus.ACTIVE },
			});
		}
	});

	it('rejects a write when a vehicle becomes unavailable after preflight', async () => {
		const preflight = await checkScheduleAvailability(actor, {
			intent: 'event_create',
			instructorId: ids.instructorId,
			eventType: EventType.DRIVE,
			vehicleId: ids.vehicleId,
			date: raceDate,
			startTime: '11:00',
			endTime: '12:00',
		});
		expect(preflight.available).toBe(true);

		await prisma.vehicle.update({
			where: { id: ids.vehicleId },
			data: { availabilityStatus: VehicleAvailabilityStatus.UNAVAILABLE },
		});

		try {
			await expect(
				createInstructorEvent(
					actor,
					eventPayload('11:00', '12:00', { date: raceDate }),
				),
			).rejects.toMatchObject({ statusCode: 400 });
		} finally {
			await prisma.vehicle.update({
				where: { id: ids.vehicleId },
				data: { availabilityStatus: VehicleAvailabilityStatus.ACTIVE },
			});
		}
	});

	it('does not let a cancelled event block instructor or vehicle availability', async () => {
		await prisma.instructorEvent.create({
			data: {
				instructorId: ids.instructorId,
				schoolId: ids.schoolId,
				vehicleId: ids.vehicleId,
				type: EventType.DRIVE,
				status: EventStatus.CANCELLED,
				startTime: instant('12:00', raceDate),
				endTime: instant('13:00', raceDate),
			},
		});

		await expect(
			bookLesson(
				actor,
				lessonPayload('12:00', '13:00', { date: raceDate }),
			),
		).resolves.toBeDefined();
	});

	it('changes only one future lesson instructor after checking actual availability', async () => {
		const changeDate = addDays(testDate, 3);
		await prisma.course.update({
			where: { id: ids.courseId },
			data: { instructorId: ids.instructorId },
		});
		const original = await prisma.lesson.create({
			data: {
				courseId: ids.courseId,
				studentId: ids.studentId,
				instructorId: ids.instructorId,
				vehicleId: ids.vehicleId,
				lessonType: LessonType.PRACTICE,
				startTime: instant('10:00', changeDate),
				endTime: instant('11:00', changeDate),
			},
		});
		const untouched = await prisma.lesson.create({
			data: {
				courseId: ids.courseId,
				studentId: ids.secondStudentId,
				instructorId: ids.instructorId,
				vehicleId: ids.vehicleId,
				lessonType: LessonType.PRACTICE,
				startTime: instant('12:00', changeDate),
				endTime: instant('13:00', changeDate),
			},
		});
		const conflict = await prisma.lesson.create({
			data: {
				courseId: ids.courseId,
				studentId: ids.secondStudentId,
				instructorId: ids.secondInstructorId,
				vehicleId: ids.secondVehicleId,
				lessonType: LessonType.PRACTICE,
				startTime: instant('10:00', changeDate),
				endTime: instant('11:00', changeDate),
			},
		});
		const expectedLessonState = {
			instructorId: ids.instructorId,
			startTime: original.startTime.toISOString(),
			endTime: original.endTime.toISOString(),
			vehicleId: ids.vehicleId,
		};
		const query = {
			date: changeDate,
			startTime: '10:00',
			endTime: '11:00',
			vehicleId: ids.vehicleId,
		};

		await expect(
			getLessonInstructorOptions(actor, original.id, query),
		).resolves.toEqual({ instructors: [] });
		await expect(
			updateLesson(actor, original.id, {
				instructorId: ids.secondInstructorId,
				expectedLessonState,
			}),
		).rejects.toMatchObject({ statusCode: 409 });

		await prisma.lesson.delete({ where: { id: conflict.id } });
		const options = await getLessonInstructorOptions(
			actor,
			original.id,
			query,
		);
		expect(
			options.instructors.map((instructor) => instructor.id),
		).toContain(ids.secondInstructorId);

		await updateLesson(actor, original.id, {
			instructorId: ids.secondInstructorId,
			expectedLessonState,
		});
		const [changed, other, course] = await Promise.all([
			prisma.lesson.findUniqueOrThrow({ where: { id: original.id } }),
			prisma.lesson.findUniqueOrThrow({ where: { id: untouched.id } }),
			prisma.course.findUniqueOrThrow({ where: { id: ids.courseId } }),
		]);
		expect(changed.instructorId).toBe(ids.secondInstructorId);
		expect(changed.startTime).toEqual(original.startTime);
		expect(changed.endTime).toEqual(original.endTime);
		expect(changed.vehicleId).toBe(ids.vehicleId);
		expect(other.instructorId).toBe(ids.instructorId);
		expect(course.instructorId).toBe(ids.instructorId);
		await expect(
			updateLesson(actor, original.id, {
				instructorId: ids.instructorId,
				expectedLessonState,
			}),
		).rejects.toMatchObject({ statusCode: 409 });
	});
});
