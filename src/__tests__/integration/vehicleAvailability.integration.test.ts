import { EventType, Role, VehicleAvailabilityStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import { polishLocalDateTimeToDate } from '../../lib/polishScheduleTime';
import {
	assertVehicleAvailableForBooking,
	vehicleHasBookingConflict,
} from '../../services/lesson/vehicleAvailability';
import {
	createInstructorEvent,
	updateInstructorEvent,
} from '../../services/event/writeModel';
import { checkScheduleAvailability } from '../../services/schedule-validation/check';

const prisma = getPrisma();
const suffix = randomUUID();
const ids = {
	managerUserId: randomUUID(),
	instructorUserId: randomUUID(),
	instructorId: randomUUID(),
	schoolId: randomUUID(),
	vehicleId: randomUUID(),
	eventId: randomUUID(),
};
const createdEventIds: string[] = [];

describe('vehicle availability with PostgreSQL', () => {
	beforeAll(async () => {
		await prisma.user.createMany({
			data: [
				{
					id: ids.managerUserId,
					firstName: 'Integration',
					lastName: 'Manager',
					email: `integration-manager-${suffix}@example.test`,
					role: Role.MANAGER,
				},
				{
					id: ids.instructorUserId,
					firstName: 'Integration',
					lastName: 'Instructor',
					email: `integration-instructor-${suffix}@example.test`,
					role: Role.INSTRUCTOR,
				},
			],
		});
		await prisma.drivingSchool.create({
			data: {
				id: ids.schoolId,
				name: `Integration school ${suffix}`,
				ownerId: ids.managerUserId,
			},
		});
		await prisma.instructorProfile.create({
			data: {
				id: ids.instructorId,
				userId: ids.instructorUserId,
				licenseNumber: `TEST-${suffix}`,
			},
		});
		await prisma.instructorSchool.create({
			data: {
				instructorId: ids.instructorId,
				schoolId: ids.schoolId,
			},
		});
		await prisma.instructorWorkingHoursDefault.create({
			data: {
				instructorId: ids.instructorId,
				dayOfWeek: 1,
				startTime: new Date('1970-01-01T07:00:00.000Z'),
				endTime: new Date('1970-01-01T19:00:00.000Z'),
			},
		});
		await prisma.vehicle.create({
			data: {
				id: ids.vehicleId,
				schoolId: ids.schoolId,
				name: 'Integration vehicle',
				registrationNumber: `IT-${suffix}`,
			},
		});
		await prisma.instructorEvent.create({
			data: {
				id: ids.eventId,
				instructorId: ids.instructorId,
				schoolId: ids.schoolId,
				vehicleId: ids.vehicleId,
				type: EventType.DRIVE,
				startTime: new Date('2026-09-24T08:00:00.000Z'),
				endTime: new Date('2026-09-24T09:00:00.000Z'),
			},
		});
	});

	afterAll(async () => {
		await prisma.instructorEvent.deleteMany({
			where: { id: { in: [ids.eventId, ...createdEventIds] } },
		});
		await prisma.vehicle.deleteMany({ where: { id: ids.vehicleId } });
		await prisma.instructorWorkingHoursDefault.deleteMany({
			where: { instructorId: ids.instructorId },
		});
		await prisma.instructorSchool.deleteMany({
			where: { instructorId: ids.instructorId },
		});
		await prisma.instructorProfile.deleteMany({
			where: { id: ids.instructorId },
		});
		await prisma.drivingSchool.deleteMany({ where: { id: ids.schoolId } });
		await prisma.user.deleteMany({
			where: { id: { in: [ids.managerUserId, ids.instructorUserId] } },
		});
		await prisma.$disconnect();
	});

	it('detects overlap but allows an adjacent vehicle window', async () => {
		await expect(
			vehicleHasBookingConflict(
				prisma,
				ids.vehicleId,
				new Date('2026-09-24T08:30:00.000Z'),
				new Date('2026-09-24T09:30:00.000Z'),
			),
		).resolves.toBe(true);

		await expect(
			vehicleHasBookingConflict(
				prisma,
				ids.vehicleId,
				new Date('2026-09-24T09:00:00.000Z'),
				new Date('2026-09-24T10:00:00.000Z'),
			),
		).resolves.toBe(false);
	});

	it('rejects a vehicle marked unavailable', async () => {
		await prisma.vehicle.update({
			where: { id: ids.vehicleId },
			data: {
				availabilityStatus: VehicleAvailabilityStatus.UNAVAILABLE,
				unavailableUntil: null,
			},
		});

		await expect(
			assertVehicleAvailableForBooking(
				prisma,
				ids.instructorId,
				ids.vehicleId,
				ids.schoolId,
				new Date('2026-09-25T08:00:00.000Z'),
				new Date('2026-09-25T09:00:00.000Z'),
			),
		).rejects.toEqual(
			expect.objectContaining<Partial<AppError>>({ statusCode: 400 }),
		);
	});

	it('allows an unrelated edit to retain an unavailable assigned vehicle', async () => {
		await expect(
			updateInstructorEvent(
				{ id: ids.managerUserId, role: Role.MANAGER },
				ids.eventId,
				{
					startTime: '2026-09-24T08:00:00.000Z',
					endTime: '2026-09-24T09:00:00.000Z',
					vehicleId: ids.vehicleId,
					capacity: 2,
				},
			),
		).resolves.toEqual(
			expect.objectContaining({
				event: expect.objectContaining({
					id: ids.eventId,
					vehicleId: ids.vehicleId,
					capacity: 2,
				}),
			}),
		);
	});

	it('keeps event preflight and authoritative write decisions in parity', async () => {
		await prisma.vehicle.update({
			where: { id: ids.vehicleId },
			data: {
				availabilityStatus: VehicleAvailabilityStatus.ACTIVE,
				unavailableUntil: null,
			},
		});

		const actor = { id: ids.managerUserId, role: Role.MANAGER };
		const candidate = {
			intent: 'event_create' as const,
			eventType: EventType.DRIVE,
			date: '2026-09-28',
			startTime: '10:00',
			endTime: '11:00',
			instructorId: ids.instructorId,
			vehicleId: ids.vehicleId,
		};

		await expect(
			checkScheduleAvailability(actor, candidate),
		).resolves.toEqual(
			expect.objectContaining({ available: true, issues: [] }),
		);

		const created = await createInstructorEvent(actor, {
			instructorId: ids.instructorId,
			type: EventType.DRIVE,
			startTime: polishLocalDateTimeToDate(
				candidate.date,
				candidate.startTime,
			).toISOString(),
			endTime: polishLocalDateTimeToDate(
				candidate.date,
				candidate.endTime,
			).toISOString(),
			vehicleId: ids.vehicleId,
		});
		createdEventIds.push(created.event.id);

		const secondPreflight = await checkScheduleAvailability(
			actor,
			candidate,
		);
		expect(secondPreflight.available).toBe(false);
		expect(secondPreflight.issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ code: 'INSTRUCTOR_BUSY' }),
				expect.objectContaining({ code: 'VEHICLE_BUSY' }),
			]),
		);

		await expect(
			createInstructorEvent(actor, {
				instructorId: ids.instructorId,
				type: EventType.DRIVE,
				startTime: created.event.startTime,
				endTime: created.event.endTime,
				vehicleId: ids.vehicleId,
			}),
		).rejects.toMatchObject({ statusCode: 409 });
	});

	it('allows only one of two concurrent writes for the same resources and window', async () => {
		const actor = { id: ids.managerUserId, role: Role.MANAGER };
		const startTime = polishLocalDateTimeToDate(
			'2026-10-05',
			'10:00',
		).toISOString();
		const endTime = polishLocalDateTimeToDate(
			'2026-10-05',
			'11:00',
		).toISOString();
		const payload = {
			instructorId: ids.instructorId,
			type: EventType.DRIVE,
			startTime,
			endTime,
			vehicleId: ids.vehicleId,
		};

		const results = await Promise.allSettled([
			createInstructorEvent(actor, payload),
			createInstructorEvent(actor, payload),
		]);
		const fulfilled = results.filter(
			(result) => result.status === 'fulfilled',
		);
		const rejected = results.filter(
			(result) => result.status === 'rejected',
		);

		for (const result of fulfilled) {
			createdEventIds.push(result.value.event.id);
		}

		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect(rejected[0]).toMatchObject({
			status: 'rejected',
			reason: expect.objectContaining({ statusCode: 409 }),
		});
	});
});
