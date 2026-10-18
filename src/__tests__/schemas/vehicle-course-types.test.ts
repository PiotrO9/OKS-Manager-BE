import { describe, expect, it } from 'vitest';
import { parseVehicleWriteBody } from '../../schemas/vehicleWrite.schemas';

const categoryId = '11111111-1111-4111-8111-111111111111';
const vehicle = { name: 'Motocykl', registrationNumber: 'WA12345' };

describe('vehicle course categories', () => {
	it('requires categories when creating a vehicle', () => {
		expect(parseVehicleWriteBody(vehicle, 'create').ok).toBe(false);
	});
	it.each([[], null, ['invalid'], 'B'].map((value) => ({ value })))(
		'rejects invalid categories: $value',
		({ value }) => {
			expect(
				parseVehicleWriteBody(
					{ ...vehicle, supportedCourseTypeIds: value },
					'patch',
				).ok,
			).toBe(false);
		},
	);
	it('deduplicates explicit category IDs', () => {
		expect(
			parseVehicleWriteBody(
				{
					...vehicle,
					supportedCourseTypeIds: [categoryId, categoryId],
				},
				'create',
			),
		).toMatchObject({ ok: true, supportedCourseTypeIds: [categoryId] });
	});
	it('preserves categories when omitted in an update', () => {
		const result = parseVehicleWriteBody(vehicle, 'patch');
		expect(result.ok).toBe(true);
		expect(result).not.toHaveProperty('supportedCourseTypeIds');
	});
});
