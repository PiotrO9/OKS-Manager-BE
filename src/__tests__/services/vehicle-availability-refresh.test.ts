import { VehicleAvailabilityStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { vehicleService } from '../../services/vehicle.service';

const { prismaMock } = vi.hoisted(() => ({
	prismaMock: {
		drivingSchool: {
			findUnique: vi.fn(),
		},
		instructorEvent: {
			findMany: vi.fn(),
		},
		lesson: {
			findMany: vi.fn(),
		},
		vehicle: {
			findMany: vi.fn(),
			findUnique: vi.fn(),
			update: vi.fn(),
		},
	},
}));

vi.mock('../../lib/prisma', () => ({
	getPrisma: () => prismaMock,
}));

const userId = '11111111-1111-1111-1111-111111111111';
const schoolId = '22222222-2222-2222-2222-222222222222';

function vehicleRow(
	id: string,
	status: VehicleAvailabilityStatus,
	unavailableUntil: Date | null,
) {
	return {
		id,
		schoolId,
		name: 'Toyota',
		registrationNumber: `WX${id.slice(0, 4)}`,
		isActive: true,
		inspectionDate: null,
		insuranceDate: null,
		brand: null,
		model: null,
		photoUrl: null,
		modelYear: null,
		mileageKm: null,
		note: null,
		availabilityStatus: status,
		unavailableUntil,
		createdAt: new Date('2026-01-01T00:00:00.000Z'),
	};
}

describe('vehicle availability read repair', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-07-11T12:00:00.000Z'));
		vi.clearAllMocks();
		prismaMock.drivingSchool.findUnique.mockResolvedValue({
			id: schoolId,
			ownerId: userId,
			deletedAt: null,
			defaultVehicleId: null,
		});
		prismaMock.vehicle.update.mockResolvedValue({});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('refreshes expired temporary unavailability while listing vehicles', async () => {
		const expiredVehicle = vehicleRow(
			'33333333-3333-3333-3333-333333333333',
			VehicleAvailabilityStatus.UNAVAILABLE,
			new Date('2026-07-10T00:00:00.000Z'),
		);
		const currentTemporaryVehicle = vehicleRow(
			'44444444-4444-4444-4444-444444444444',
			VehicleAvailabilityStatus.UNAVAILABLE,
			new Date('2026-07-11T00:00:00.000Z'),
		);
		const indefiniteVehicle = vehicleRow(
			'55555555-5555-5555-5555-555555555555',
			VehicleAvailabilityStatus.UNAVAILABLE,
			null,
		);
		const activeVehicle = vehicleRow(
			'66666666-6666-6666-6666-666666666666',
			VehicleAvailabilityStatus.ACTIVE,
			null,
		);
		prismaMock.vehicle.findMany.mockResolvedValue([
			expiredVehicle,
			currentTemporaryVehicle,
			indefiniteVehicle,
			activeVehicle,
		]);

		const result = await vehicleService.listVehiclesBySchoolForUser(
			userId,
			schoolId,
		);

		expect(result.vehicles).toEqual([
			expect.objectContaining({
				id: expiredVehicle.id,
				status: VehicleAvailabilityStatus.ACTIVE,
				unavailableUntil: null,
			}),
			expect.objectContaining({
				id: currentTemporaryVehicle.id,
				status: VehicleAvailabilityStatus.UNAVAILABLE,
				unavailableUntil: '2026-07-11',
			}),
			expect.objectContaining({
				id: indefiniteVehicle.id,
				status: VehicleAvailabilityStatus.UNAVAILABLE,
				unavailableUntil: null,
			}),
			expect.objectContaining({
				id: activeVehicle.id,
				status: VehicleAvailabilityStatus.ACTIVE,
				unavailableUntil: null,
			}),
		]);
		expect(prismaMock.vehicle.update).toHaveBeenCalledTimes(1);
		expect(prismaMock.vehicle.update).toHaveBeenCalledWith({
			where: { id: expiredVehicle.id },
			data: {
				availabilityStatus: VehicleAvailabilityStatus.ACTIVE,
				unavailableUntil: null,
			},
		});
	});

	it('refreshes expired temporary unavailability while reading vehicle details', async () => {
		const expiredVehicle = vehicleRow(
			'77777777-7777-7777-7777-777777777777',
			VehicleAvailabilityStatus.UNAVAILABLE,
			new Date('2026-07-10T00:00:00.000Z'),
		);
		prismaMock.vehicle.findUnique.mockResolvedValue({
			...expiredVehicle,
			school: {
				ownerId: userId,
				deletedAt: null,
				defaultVehicleId: null,
			},
		});

		const result = await vehicleService.getVehicleByIdForUser(
			userId,
			expiredVehicle.id,
		);

		expect(result).toMatchObject({
			id: expiredVehicle.id,
			status: VehicleAvailabilityStatus.ACTIVE,
			unavailableUntil: null,
		});
		expect(prismaMock.vehicle.update).toHaveBeenCalledWith({
			where: { id: expiredVehicle.id },
			data: {
				availabilityStatus: VehicleAvailabilityStatus.ACTIVE,
				unavailableUntil: null,
			},
		});
	});
});
