import { describe, expect, it } from 'vitest';
import { vehicleAvailabilityStatusSchema } from '../../schemas/vehicle.schemas';

describe('vehicleAvailabilityStatusSchema', () => {
	it('accepts ACTIVE', () => {
		const parsed = vehicleAvailabilityStatusSchema.safeParse({
			status: 'ACTIVE',
		});

		expect(parsed.success).toBe(true);
	});

	it('accepts UNAVAILABLE', () => {
		const parsed = vehicleAvailabilityStatusSchema.safeParse({
			status: 'UNAVAILABLE',
		});

		expect(parsed.success).toBe(true);
	});

	it('rejects an unsupported status string', () => {
		const parsed = vehicleAvailabilityStatusSchema.safeParse({
			status: 'IN_SERVICE',
		});

		expect(parsed.success).toBe(false);
	});

	it('rejects missing status', () => {
		const parsed = vehicleAvailabilityStatusSchema.safeParse({});

		expect(parsed.success).toBe(false);
	});

	it('rejects a non-string status', () => {
		const parsed = vehicleAvailabilityStatusSchema.safeParse({
			status: 123,
		});

		expect(parsed.success).toBe(false);
	});
});
