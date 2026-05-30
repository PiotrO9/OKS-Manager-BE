import { VehicleStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { patchVehicleStatusBodySchema } from '../../schemas/vehicle.schemas';

describe('patchVehicleStatusBodySchema', () => {
	it('accepts ACTIVE', () => {
		const parsed = patchVehicleStatusBodySchema.safeParse({
			status: VehicleStatus.ACTIVE,
		});

		expect(parsed.success).toBe(true);
	});

	it('accepts UNAVAILABLE', () => {
		const parsed = patchVehicleStatusBodySchema.safeParse({
			status: VehicleStatus.UNAVAILABLE,
		});

		expect(parsed.success).toBe(true);
	});

	it('rejects an unsupported status string', () => {
		const parsed = patchVehicleStatusBodySchema.safeParse({
			status: 'IN_SERVICE',
		});

		expect(parsed.success).toBe(false);
	});

	it('rejects missing status', () => {
		const parsed = patchVehicleStatusBodySchema.safeParse({});

		expect(parsed.success).toBe(false);
	});

	it('rejects a non-string status', () => {
		const parsed = patchVehicleStatusBodySchema.safeParse({ status: 123 });

		expect(parsed.success).toBe(false);
	});
});
