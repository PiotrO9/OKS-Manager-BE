import { VehicleAvailabilityStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { vehicleService } from '../../services/vehicle.service';

const { prismaMock } = vi.hoisted(() => ({
	prismaMock: {
		drivingSchool: {
			findUnique: vi.fn(),
		},
		vehicle: {
			findUnique: vi.fn(),
			update: vi.fn(),
		},
	},
}));

vi.mock('../../lib/prisma', () => ({
	getPrisma: () => prismaMock,
}));

const userId = '11111111-1111-1111-1111-111111111111';
const vehicleId = '22222222-2222-2222-2222-222222222222';
const schoolId = '33333333-3333-3333-3333-333333333333';

function mockUpdatedVehicle(status: VehicleAvailabilityStatus) {
	prismaMock.vehicle.update.mockResolvedValue({
		id: vehicleId,
		schoolId,
		name: 'Toyota',
		registrationNumber: 'WX12345',
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
		createdAt: new Date('2026-01-01T00:00:00.000Z'),
	});
}

function mockVehicle(isActive = true) {
	prismaMock.vehicle.findUnique.mockResolvedValue({
		id: vehicleId,
		schoolId,
		isActive,
	});
}

function mockOwnedSchool(ownerId = userId) {
	prismaMock.drivingSchool.findUnique.mockResolvedValue({
		id: schoolId,
		ownerId,
		deletedAt: null,
	});
}

describe('vehicleService.updateVehicleStatusForUser', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockUpdatedVehicle(VehicleAvailabilityStatus.UNAVAILABLE);
	});

	it('updates status for an active vehicle owned by the user', async () => {
		mockVehicle();
		mockOwnedSchool();

		await expect(
			vehicleService.updateVehicleStatusForUser(
				userId,
				vehicleId,
				VehicleAvailabilityStatus.UNAVAILABLE,
			),
		).resolves.toMatchObject({
			id: vehicleId,
			status: VehicleAvailabilityStatus.UNAVAILABLE,
		});

		expect(prismaMock.vehicle.update).toHaveBeenCalledWith({
			where: { id: vehicleId },
			data: {
				availabilityStatus: VehicleAvailabilityStatus.UNAVAILABLE,
			},
		});
	});

	it('treats setting the same status as success', async () => {
		mockVehicle();
		mockOwnedSchool();
		mockUpdatedVehicle(VehicleAvailabilityStatus.ACTIVE);

		await expect(
			vehicleService.updateVehicleStatusForUser(
				userId,
				vehicleId,
				VehicleAvailabilityStatus.ACTIVE,
			),
		).resolves.toMatchObject({
			id: vehicleId,
			status: VehicleAvailabilityStatus.ACTIVE,
		});

		expect(prismaMock.vehicle.update).toHaveBeenCalledWith({
			where: { id: vehicleId },
			data: { availabilityStatus: VehicleAvailabilityStatus.ACTIVE },
		});
	});

	it('throws 404 when the vehicle does not exist', async () => {
		prismaMock.vehicle.findUnique.mockResolvedValue(null);

		await expect(
			vehicleService.updateVehicleStatusForUser(
				userId,
				vehicleId,
				VehicleAvailabilityStatus.ACTIVE,
			),
		).rejects.toMatchObject({
			statusCode: 404,
			message: 'Vehicle not found',
		});

		expect(prismaMock.vehicle.update).not.toHaveBeenCalled();
	});

	it('throws 403 when the vehicle belongs to another user school', async () => {
		mockVehicle();
		mockOwnedSchool('44444444-4444-4444-4444-444444444444');

		await expect(
			vehicleService.updateVehicleStatusForUser(
				userId,
				vehicleId,
				VehicleAvailabilityStatus.ACTIVE,
			),
		).rejects.toMatchObject({
			statusCode: 403,
			message: 'Forbidden',
		});

		expect(prismaMock.vehicle.update).not.toHaveBeenCalled();
	});

	it('throws 404 when the vehicle is inactive', async () => {
		mockVehicle(false);
		mockOwnedSchool();

		await expect(
			vehicleService.updateVehicleStatusForUser(
				userId,
				vehicleId,
				VehicleAvailabilityStatus.ACTIVE,
			),
		).rejects.toMatchObject({
			statusCode: 404,
			message: 'Vehicle not found',
		});

		expect(prismaMock.vehicle.update).not.toHaveBeenCalled();
	});
});
