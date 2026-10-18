import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	deleteVehicleForUser,
	upsertVehicleForUser,
} from '../../services/vehicle/commands';

const { db } = vi.hoisted(() => {
	const tx = {
		courseType: { count: vi.fn().mockResolvedValue(1) },
		$queryRaw: vi.fn(),
		vehicle: {
			findUnique: vi.fn(),
			findFirst: vi.fn(),
			count: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
		},
		drivingSchool: { findUnique: vi.fn(), update: vi.fn() },
		lesson: { findMany: vi.fn() },
		instructorEvent: { findMany: vi.fn() },
	};
	return { db: { ...tx, $transaction: vi.fn(async (fn) => fn(tx)) } };
});

vi.mock('../../lib/prisma', () => ({ getPrisma: () => db }));

const userId = '11111111-1111-1111-1111-111111111111';
const schoolId = '22222222-2222-4222-8222-222222222222';
const vehicleId = '33333333-3333-3333-3333-333333333333';

describe('deleteVehicleForUser', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		db.vehicle.findUnique.mockResolvedValue({
			id: vehicleId,
			schoolId,
			isActive: true,
		});
		db.drivingSchool.findUnique.mockResolvedValue({
			ownerId: userId,
			deletedAt: null,
			defaultVehicleId: null,
		});
		db.lesson.findMany.mockResolvedValue([]);
		db.instructorEvent.findMany.mockResolvedValue([]);
		db.vehicle.count.mockResolvedValue(1);
		db.vehicle.update.mockResolvedValue({ id: vehicleId });
	});

	it('rejects deletion of the default vehicle', async () => {
		db.drivingSchool.findUnique.mockResolvedValue({
			ownerId: userId,
			deletedAt: null,
			defaultVehicleId: vehicleId,
		});
		await expect(
			deleteVehicleForUser(userId, vehicleId),
		).rejects.toMatchObject({ statusCode: 409 });
		expect(db.vehicle.update).not.toHaveBeenCalled();
	});

	it('deletes the only default vehicle and clears the school default', async () => {
		db.drivingSchool.findUnique.mockResolvedValue({
			ownerId: userId,
			deletedAt: null,
			defaultVehicleId: vehicleId,
		});
		db.vehicle.count.mockResolvedValue(0);

		await expect(deleteVehicleForUser(userId, vehicleId)).resolves.toEqual({
			id: vehicleId,
		});
		expect(db.drivingSchool.update).toHaveBeenCalledWith({
			where: { id: schoolId },
			data: { defaultVehicleId: null },
		});
		expect(db.vehicle.update).toHaveBeenCalledWith({
			where: { id: vehicleId },
			data: { isActive: false },
		});
	});

	it('still blocks the only default vehicle when a future lesson exists', async () => {
		db.drivingSchool.findUnique.mockResolvedValue({
			ownerId: userId,
			deletedAt: null,
			defaultVehicleId: vehicleId,
		});
		db.vehicle.count.mockResolvedValue(0);
		db.lesson.findMany.mockResolvedValue([{ vehicleId }]);

		await expect(
			deleteVehicleForUser(userId, vehicleId),
		).rejects.toMatchObject({ statusCode: 409 });
		expect(db.drivingSchool.update).not.toHaveBeenCalled();
		expect(db.vehicle.update).not.toHaveBeenCalled();
	});

	it.each(['lesson', 'event'])(
		'rejects deletion with a current or future %s',
		async (kind) => {
			db[
				kind === 'lesson' ? 'lesson' : 'instructorEvent'
			].findMany.mockResolvedValue([{ vehicleId }]);
			await expect(
				deleteVehicleForUser(userId, vehicleId),
			).rejects.toMatchObject({ statusCode: 409 });
			expect(db.vehicle.update).not.toHaveBeenCalled();
		},
	);

	it('allows deletion when there are no current or future bookings', async () => {
		await expect(deleteVehicleForUser(userId, vehicleId)).resolves.toEqual({
			id: vehicleId,
		});
		expect(db.lesson.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					deletedAt: null,
					status: 'SCHEDULED',
					endTime: { gt: expect.any(Date) },
				}),
			}),
		);
		expect(db.instructorEvent.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					status: 'PLANNED',
					endTime: { gt: expect.any(Date) },
				}),
			}),
		);
		expect(db.vehicle.update).toHaveBeenCalledWith({
			where: { id: vehicleId },
			data: { isActive: false },
		});
	});

	it('rejects deletion from another school owner', async () => {
		db.drivingSchool.findUnique.mockResolvedValue({
			ownerId: '44444444-4444-4444-4444-444444444444',
			deletedAt: null,
			defaultVehicleId: null,
		});
		await expect(
			deleteVehicleForUser(userId, vehicleId),
		).rejects.toMatchObject({ statusCode: 403 });
		expect(db.vehicle.update).not.toHaveBeenCalled();
	});
});

describe('upsertVehicleForUser after an empty fleet', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		db.drivingSchool.findUnique.mockResolvedValue({
			id: schoolId,
			ownerId: userId,
			deletedAt: null,
			defaultVehicleId: null,
		});
		db.vehicle.findFirst.mockResolvedValue(null);
		db.vehicle.count.mockResolvedValue(0);
		db.vehicle.create.mockResolvedValue({
			id: vehicleId,
			schoolId,
			name: 'Nowy samochód',
			registrationNumber: 'WX12345',
			isActive: true,
			availabilityStatus: 'ACTIVE',
			unavailableUntil: null,
			inspectionDate: null,
			insuranceDate: null,
			brand: null,
			model: null,
			photoUrl: null,
			modelYear: null,
			mileageKm: null,
			note: null,
			createdAt: new Date('2026-10-11T00:00:00Z'),
			updatedAt: null,
		});
	});

	it('makes a new vehicle default even when inactive historical vehicles remain', async () => {
		await expect(
			upsertVehicleForUser(userId, {
				supportedCourseTypeIds: [
					'11111111-1111-4111-8111-111111111111',
				],
				schoolId,
				name: 'Nowy samochód',
				registrationNumber: 'WX12345',
			}),
		).resolves.toMatchObject({ status: 201, vehicle: { id: vehicleId } });
		expect(db.vehicle.count).toHaveBeenCalledWith({
			where: { schoolId, isActive: true },
		});
		expect(db.drivingSchool.update).toHaveBeenCalledWith({
			where: { id: schoolId },
			data: { defaultVehicleId: vehicleId },
		});
	});
});
