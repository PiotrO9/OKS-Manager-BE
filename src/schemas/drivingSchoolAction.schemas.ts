import { z } from 'zod';
import {
	UUID_PARAM_RE,
	drivingSchoolIdParamsSchema,
} from '../lib/validation/uuid';

export { drivingSchoolIdParamsSchema };

function firstBodyValue(val: unknown): unknown {
	if (Array.isArray(val)) {
		return val.length === 0 ? undefined : val[0];
	}
	return val;
}

export const setDefaultVehicleBodySchema = z.object({
	vehicleId: z.preprocess(
		firstBodyValue,
		z
			.string({ required_error: 'vehicleId is required' })
			.min(1, 'vehicleId is required')
			.regex(UUID_PARAM_RE, 'Invalid vehicleId'),
	),
});
