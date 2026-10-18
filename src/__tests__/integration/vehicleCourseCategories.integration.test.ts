import {
	CourseKind,
	EventType,
	LessonStatus,
	LessonType,
	Role,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getScheduleAvailabilityOptions } from '../../services/schedule-validation/options';
import {
	createInstructorEvent,
	updateInstructorEvent,
	bulkUpdateEventStatus,
} from '../../services/event/writeModel';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getPrisma } from '../../lib/prisma';
import {
	polishLocalDateTimeToDate,
	polishTodayYyyymmdd,
} from '../../lib/polishScheduleTime';
import {
	assertVehicleCategoriesCanChange,
	assertVehicleSupportsCourseType,
} from '../../lib/vehicleCourseCategories';
import { bookLesson, bookOwnLesson } from '../../services/lesson/bookingRules';
import { updateLesson } from '../../services/lesson/writeModel';
import { updateVehicleForUser } from '../../services/vehicle/commands';
import { listVehiclesBySchoolForUser } from '../../services/vehicle/queries';
import { checkScheduleAvailability } from '../../services/schedule-validation/check';
import { runScheduleWriteTransaction } from '../../services/schedule-validation/transaction';
import { loadCourseVehicleSlotFilter } from '../../services/school-availability/vehicleSlots';

const db = getPrisma();
const id = Object.fromEntries(
	[
		'manager',
		'instructorUser',
		'studentUser',
		'instructor',
		'student',
		'school',
		'course',
		'a',
		'b',
		'car',
		'motorcycle',
		'legacy',
	].map((key) => [key, randomUUID()]),
) as Record<string, string>;
const actor = { id: id.manager!, role: Role.MANAGER };
const next = new Date(polishTodayYyyymmdd() + 'T12:00:00Z');
next.setUTCDate(next.getUTCDate() + 2);
const date = next.toISOString().slice(0, 10);
const time = (hour: string) => polishLocalDateTimeToDate(date, hour);
const lessonData = () => ({
	courseId: id.course!,
	studentId: id.student!,
	instructorId: id.instructor!,
	vehicleId: id.car!,
	lessonType: LessonType.PRACTICE,
	startTime: time('10:00'),
	endTime: time('11:00'),
});
const booking = (vehicleId = id.car!) => ({
	lessonType: 'PRACTICE' as const,
	courseId: id.course!,
	studentId: id.studentUser!,
	instructorId: id.instructor!,
	vehicleId,
	startTime: time('10:00').toISOString(),
	endTime: time('11:00').toISOString(),
});
const patch = (ids: string[]) => ({
	name: 'Car',
	registrationNumber: id.car!,
	supportedCourseTypeIds: ids,
});

describe('vehicle/course categories with PostgreSQL', () => {
	beforeAll(async () => {
		await db.user.createMany({
			data: [
				[id.manager!, Role.MANAGER],
				[id.instructorUser!, Role.INSTRUCTOR],
				[id.studentUser!, Role.STUDENT],
			].map(([userId, role]) => ({
				id: userId!,
				email: userId + '@category.test',
				firstName: 'Category',
				lastName: 'Test',
				role: role as Role,
			})),
		});
		await db.drivingSchool.create({
			data: {
				id: id.school!,
				ownerId: id.manager!,
				name: 'Category integration',
			},
		});
		await db.schoolSettings.create({
			data: {
				schoolId: id.school!,
				workingDaysMask: 127,
				bookingMaxDaysAhead: 30,
				practiceMinDurationMinutes: 60,
				practiceMaxDurationMinutes: 120,
			},
		});
		await db.courseType.createMany({
			data: [
				{ id: id.a!, code: 'A-' + id.a, name: 'A' },
				{ id: id.b!, code: 'B-' + id.b, name: 'B' },
			],
		});
		await db.instructorProfile.create({
			data: {
				id: id.instructor!,
				userId: id.instructorUser!,
				licenseNumber: id.instructor!,
				qualifiedCourseTypes: {
					connect: [{ id: id.a! }, { id: id.b! }],
				},
			},
		});
		await db.studentProfile.create({
			data: { id: id.student!, userId: id.studentUser! },
		});
		await db.instructorSchool.create({
			data: { instructorId: id.instructor!, schoolId: id.school! },
		});
		await db.studentSchool.create({
			data: { studentId: id.student!, schoolId: id.school! },
		});
		await db.instructorWorkingHoursDefault.createMany({
			data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
				instructorId: id.instructor!,
				dayOfWeek,
				startTime: new Date('1970-01-01T06:00:00Z'),
				endTime: new Date('1970-01-01T22:00:00Z'),
			})),
		});
		await db.course.create({
			data: {
				id: id.course!,
				schoolId: id.school!,
				name: 'Course B',
				category: 'B',
				courseTypeId: id.b!,
				kind: CourseKind.PRACTICAL,
				totalHours: 30,
				instructorId: id.instructor!,
			},
		});
		await db.courseParticipant.create({
			data: {
				courseId: id.course!,
				studentId: id.student!,
				status: 'ACTIVE',
			},
		});
		for (const [key, type] of [
			['car', 'b'],
			['motorcycle', 'a'],
			['legacy', null],
		] as const) {
			await db.vehicle.create({
				data: {
					id: id[key]!,
					schoolId: id.school!,
					name: key,
					registrationNumber: id[key]!,
					...(type
						? {
								supportedCourseTypes: {
									connect: { id: id[type]! },
								},
							}
						: {}),
				},
			});
		}
		await db.drivingSchool.update({
			where: { id: id.school! },
			data: { defaultVehicleId: id.motorcycle! },
		});
	});
	beforeEach(async () => {
		await db.lesson.deleteMany({ where: { courseId: id.course! } });
		await db.instructorEvent.deleteMany({
			where: { schoolId: id.school! },
		});
		await db.vehicle.update({
			where: { id: id.car! },
			data: {
				isActive: true,
				availabilityStatus: 'ACTIVE',
				supportedCourseTypes: { set: [{ id: id.b! }] },
			},
		});
	});
	afterAll(async () => {
		await db.lesson.deleteMany({ where: { courseId: id.course! } });
		await db.instructorEvent.deleteMany({
			where: { schoolId: id.school! },
		});
		await db.courseParticipant.deleteMany({
			where: { courseId: id.course! },
		});
		await db.course.deleteMany({ where: { id: id.course! } });
		await db.drivingSchool.update({
			where: { id: id.school! },
			data: { defaultVehicleId: null },
		});
		await db.vehicle.deleteMany({ where: { schoolId: id.school! } });
		await db.instructorWorkingHoursDefault.deleteMany({
			where: { instructorId: id.instructor! },
		});
		await db.instructorSchool.deleteMany({
			where: { schoolId: id.school! },
		});
		await db.studentSchool.deleteMany({ where: { schoolId: id.school! } });
		await db.instructorProfile.deleteMany({
			where: { id: id.instructor! },
		});
		await db.studentProfile.deleteMany({ where: { id: id.student! } });
		await db.schoolSettings.deleteMany({ where: { schoolId: id.school! } });
		await db.drivingSchool.deleteMany({ where: { id: id.school! } });
		await db.courseType.deleteMany({
			where: { id: { in: [id.a!, id.b!] } },
		});
		await db.user.deleteMany({
			where: {
				id: { in: [id.manager!, id.instructorUser!, id.studentUser!] },
			},
		});
		await db.$disconnect();
	});
	it('rejects mismatched and legacy vehicles in manager booking and availability', async () => {
		for (const vehicleId of [id.motorcycle!, id.legacy!]) {
			await expect(
				bookLesson(actor, booking(vehicleId)),
			).rejects.toMatchObject({ reason: 'VEHICLE_COURSE_TYPE_MISMATCH' });
			await expect(
				checkScheduleAvailability(actor, {
					intent: 'lesson_create',
					courseId: id.course!,
					studentId: id.studentUser!,
					instructorId: id.instructor!,
					vehicleId,
					date,
					startTime: '10:00',
					endTime: '11:00',
				}),
			).resolves.toMatchObject({
				available: false,
				issues: expect.arrayContaining([
					{
						code: 'VEHICLE_COURSE_TYPE_MISMATCH',
						field: 'vehicleId',
					},
				]),
			});
		}
		expect(await db.lesson.count({ where: { courseId: id.course! } })).toBe(
			0,
		);
	});
	it('automatically selects a compatible car even when a motorcycle is default', async () => {
		const result = await bookOwnLesson(
			{ id: id.studentUser!, role: Role.STUDENT },
			{
				courseId: id.course!,
				instructorId: id.instructor!,
				startTime: time('10:00').toISOString(),
				endTime: time('11:00').toISOString(),
			},
		);
		expect(result.lesson.vehicleId).toBe(id.car);
	});
	it('returns NO_VEHICLE_AVAILABLE when no compatible vehicle is usable', async () => {
		await db.vehicle.update({
			where: { id: id.car! },
			data: { availabilityStatus: 'UNAVAILABLE' },
		});
		await expect(
			bookOwnLesson(
				{ id: id.studentUser!, role: Role.STUDENT },
				{
					courseId: id.course!,
					instructorId: id.instructor!,
					startTime: time('10:00').toISOString(),
					endTime: time('11:00').toISOString(),
				},
			),
		).rejects.toMatchObject({ reason: 'NO_VEHICLE_AVAILABLE' });
	});
	it('filters course-aware fleet but retains legacy vehicles in the normal fleet', async () => {
		const fleet = await listVehiclesBySchoolForUser(
			id.manager!,
			id.school!,
		);
		expect(fleet.vehicles).toHaveLength(3);
		expect(
			fleet.vehicles.find((v) => v.id === id.legacy)
				?.supportedCourseTypes,
		).toEqual([]);
		const compatible = await listVehiclesBySchoolForUser(
			id.manager!,
			id.school!,
			undefined,
			id.course!,
		);
		expect(compatible.vehicles.map((v) => v.id)).toEqual([id.car]);
		await expect(
			listVehiclesBySchoolForUser(
				randomUUID(),
				id.school!,
				undefined,
				id.course!,
			),
		).rejects.toMatchObject({ statusCode: 403 });
		await expect(
			listVehiclesBySchoolForUser(
				id.manager!,
				id.school!,
				undefined,
				randomUUID(),
			),
		).rejects.toMatchObject({ statusCode: 404 });
	});
	it('rejects incompatible vehicle on lesson edit without modifying the lesson', async () => {
		const result = await bookLesson(actor, booking());
		await expect(
			updateLesson(actor, result.lesson.id, {
				vehicleId: id.motorcycle!,
			}),
		).rejects.toMatchObject({ reason: 'VEHICLE_COURSE_TYPE_MISMATCH' });
		expect(
			(
				await db.lesson.findUniqueOrThrow({
					where: { id: result.lesson.id },
				})
			).vehicleId,
		).toBe(id.car);
	});
	it('preserves omitted categories and rejects unknown categories atomically', async () => {
		await updateVehicleForUser(id.manager!, id.car!, {
			name: 'Car renamed',
			registrationNumber: id.car!,
		});
		await expect(
			assertVehicleSupportsCourseType(db, id.car!, id.b!),
		).resolves.toBeUndefined();
		await expect(
			updateVehicleForUser(id.manager!, id.car!, patch([randomUUID()])),
		).rejects.toMatchObject({ statusCode: 400 });
		await expect(
			assertVehicleSupportsCourseType(db, id.car!, id.b!),
		).resolves.toBeUndefined();
	});
	it('blocks removing a category used by a future or ongoing lesson, but allows adding one', async () => {
		await db.lesson.create({ data: lessonData() });
		await expect(
			updateVehicleForUser(id.manager!, id.car!, patch([id.a!])),
		).rejects.toMatchObject({ statusCode: 409 });
		await expect(
			updateVehicleForUser(id.manager!, id.car!, patch([id.a!, id.b!])),
		).resolves.toMatchObject({
			supportedCourseTypes: expect.arrayContaining([
				expect.objectContaining({ id: id.a! }),
				expect.objectContaining({ id: id.b! }),
			]),
		});
		await db.lesson.updateMany({
			where: { courseId: id.course! },
			data: {
				startTime: new Date(Date.now() - 60000),
				endTime: new Date(Date.now() + 60000),
			},
		});
		await expect(
			updateVehicleForUser(id.manager!, id.car!, patch([id.a!])),
		).rejects.toMatchObject({ statusCode: 409 });
	});
	it('ignores cancelled and historical lessons when removing categories', async () => {
		await db.lesson.create({
			data: { ...lessonData(), status: LessonStatus.CANCELLED },
		});
		await db.lesson.create({
			data: {
				...lessonData(),
				startTime: new Date('2025-01-01T08:00:00Z'),
				endTime: new Date('2025-01-01T09:00:00Z'),
			},
		});
		await expect(
			updateVehicleForUser(id.manager!, id.car!, patch([id.a!])),
		).resolves.toMatchObject({
			supportedCourseTypes: [expect.objectContaining({ id: id.a! })],
		});
	});
	it('includes course-bound DRIVE events in the category removal guard', async () => {
		await db.instructorEvent.create({
			data: {
				instructorId: id.instructor!,
				schoolId: id.school!,
				courseId: id.course!,
				vehicleId: id.car!,
				type: EventType.DRIVE,
				startTime: time('10:00'),
				endTime: time('11:00'),
			},
		});
		await expect(
			updateVehicleForUser(id.manager!, id.car!, patch([id.a!])),
		).rejects.toMatchObject({ statusCode: 409 });
	});
	it('requires one compatible vehicle for the whole slot and allows adjacency', async () => {
		await db.vehicle.update({
			where: { id: id.motorcycle! },
			data: { supportedCourseTypes: { connect: { id: id.b! } } },
		});
		await db.lesson.create({
			data: {
				...lessonData(),
				startTime: time('10:00'),
				endTime: time('10:30'),
			},
		});
		await db.instructorEvent.create({
			data: {
				instructorId: id.instructor!,
				schoolId: id.school!,
				vehicleId: id.motorcycle!,
				type: EventType.DRIVE,
				startTime: time('10:30'),
				endTime: time('11:00'),
			},
		});
		const filter = await loadCourseVehicleSlotFilter(
			db,
			id.school!,
			id.b!,
			date,
			date,
		);
		expect(filter({ date, startTime: '10:00', endTime: '11:00' })).toBe(
			false,
		);
		expect(filter({ date, startTime: '11:00', endTime: '12:00' })).toBe(
			true,
		);
		await db.vehicle.update({
			where: { id: id.motorcycle! },
			data: { supportedCourseTypes: { set: [{ id: id.a! }] } },
		});
	});

	it('filters edit options by category and excludes the edited lesson from conflicts', async () => {
		const lesson = await db.lesson.create({ data: lessonData() });
		const result = await getScheduleAvailabilityOptions(actor, {
			intent: 'lesson_edit',
			lessonId: lesson.id,
			instructorId: id.instructor!,
			vehicleId: id.car!,
			date,
		});
		expect(result.availableVehicleIds).toEqual([id.car]);
		expect(result.options.length).toBeGreaterThan(0);
		const mismatch = await getScheduleAvailabilityOptions(actor, {
			intent: 'lesson_edit',
			lessonId: lesson.id,
			instructorId: id.instructor!,
			vehicleId: id.motorcycle!,
			date,
		});
		expect(mismatch.options).toEqual([]);
	});
	it('checks conversion and reactivation of course-bound events, while ordinary DRIVE remains usable', async () => {
		const event = await db.instructorEvent.create({
			data: {
				schoolId: id.school!,
				instructorId: id.instructor!,
				courseId: id.course!,
				type: 'THEORY',
				startTime: time('10:00'),
				endTime: time('11:00'),
			},
		});
		await expect(
			updateInstructorEvent(actor, event.id, {
				type: EventType.DRIVE,
				vehicleId: id.motorcycle!,
			}),
		).rejects.toMatchObject({ reason: 'VEHICLE_COURSE_TYPE_MISMATCH' });
		await db.instructorEvent.update({
			where: { id: event.id },
			data: {
				type: 'DRIVE',
				vehicleId: id.motorcycle!,
				status: 'CANCELLED',
			},
		});
		await expect(
			bulkUpdateEventStatus(actor, {
				eventIds: [event.id],
				status: 'PLANNED',
			}),
		).rejects.toMatchObject({ reason: 'VEHICLE_COURSE_TYPE_MISMATCH' });
		expect(
			(
				await db.instructorEvent.findUniqueOrThrow({
					where: { id: event.id },
				})
			).status,
		).toBe('CANCELLED');
		await expect(
			createInstructorEvent(actor, {
				instructorId: id.instructor!,
				type: EventType.DRIVE,
				vehicleId: id.legacy!,
				startTime: time('12:00').toISOString(),
				endTime: time('13:00').toISOString(),
			}),
		).resolves.toMatchObject({ event: { vehicleId: id.legacy } });
	});
	it('keeps RLS enabled on the category relation', async () => {
		const rows = await db.$queryRawUnsafe<{ relrowsecurity: boolean }[]>(
			"SELECT relrowsecurity FROM pg_class WHERE relname = '_VehicleSupportedCourseTypes'",
		);
		expect(rows[0]?.relrowsecurity).toBe(true);
	});
	it('audits without writes and applies explicit additive mappings idempotently', async () => {
		const path = join(
			tmpdir(),
			'osk-vehicle-categories-' + randomUUID() + '.json',
		);
		const mapping = [
			{ vehicleId: id.legacy!, supportedCourseTypeIds: [id.b!, id.b!] },
		];
		await writeFile(path, JSON.stringify(mapping), 'utf8');
		const run = (extra: string[]) =>
			JSON.parse(
				execFileSync(
					process.execPath,
					[
						'scripts/vehicle-categories.mjs',
						'--school',
						id.school!,
						'--mapping',
						path,
						...extra,
					],
					{
						env: {
							...process.env,
							DATABASE_URL: process.env.TEST_DATABASE_URL,
						},
						encoding: 'utf8',
						stdio: ['ignore', 'pipe', 'pipe'],
					},
				),
			);
		try {
			expect(run([]).mode).toBe('DRY_RUN');
			expect(
				await db.vehicle.count({
					where: {
						id: id.legacy!,
						supportedCourseTypes: { some: { id: id.b! } },
					},
				}),
			).toBe(0);
			expect(run(['--apply']).ready).toBe(true);
			expect(run(['--apply']).ready).toBe(true);
			expect(
				(
					await db.vehicle.findUniqueOrThrow({
						where: { id: id.legacy! },
						select: { supportedCourseTypes: true },
					})
				).supportedCourseTypes,
			).toHaveLength(1);
			await writeFile(
				path,
				JSON.stringify([
					...mapping,
					{
						vehicleId: randomUUID(),
						supportedCourseTypeIds: [id.a!],
					},
				]),
				'utf8',
			);
			expect(() => run(['--apply'])).toThrow();
		} finally {
			await unlink(path);
			await db.vehicle.update({
				where: { id: id.legacy! },
				data: { supportedCourseTypes: { set: [] } },
			});
		}
	});
	it('serializes category removal against a booking after both read the original state', async () => {
		let arrivals = 0;
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const rendezvous = async () => {
			if (++arrivals === 2) release();
			await gate;
		};
		let bookingAttempt = 0;
		let removalAttempt = 0;
		const results = await Promise.allSettled([
			runScheduleWriteTransaction(async (tx) => {
				await assertVehicleSupportsCourseType(tx, id.car!, id.b!);
				if (++bookingAttempt === 1) await rendezvous();
				return tx.lesson.create({ data: lessonData() });
			}),
			runScheduleWriteTransaction(async (tx) => {
				await assertVehicleCategoriesCanChange(tx, id.car!, [id.a!]);
				if (++removalAttempt === 1) await rendezvous();
				return tx.vehicle.update({
					where: { id: id.car! },
					data: { supportedCourseTypes: { set: [{ id: id.a! }] } },
				});
			}),
		]);
		expect(
			results.filter((result) => result.status === 'fulfilled'),
		).toHaveLength(1);
		const lessons = await db.lesson.count({
			where: { courseId: id.course! },
		});
		const compatible = await db.vehicle.count({
			where: {
				id: id.car!,
				supportedCourseTypes: { some: { id: id.b! } },
			},
		});
		expect(lessons === 0 || compatible === 1).toBe(true);
	});
});
