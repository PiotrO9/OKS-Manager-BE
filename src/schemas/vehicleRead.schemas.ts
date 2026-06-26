import { z } from 'zod';
import {
	schoolIdQuerySchema,
	vehicleIdParamsSchema,
} from '../lib/validation/uuid';

export { vehicleIdParamsSchema };

export const vehicleAvailabilityStatusSchema = z.object({
	status: z.enum(['ACTIVE', 'UNAVAILABLE']),
});

export const vehicleListQuerySchema = schoolIdQuerySchema
	.merge(
		z.object({
			startTime: z.preprocess(
				(v) => (v === '' || v === undefined ? undefined : v),
				z.string().datetime().optional(),
			),
			endTime: z.preprocess(
				(v) => (v === '' || v === undefined ? undefined : v),
				z.string().datetime().optional(),
			),
		}),
	)
	.superRefine((data, ctx) => {
		const hasStart = data.startTime !== undefined;
		const hasEnd = data.endTime !== undefined;
		if (hasStart !== hasEnd) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					'startTime and endTime must both be provided or both omitted',
				path: hasStart ? ['endTime'] : ['startTime'],
			});
			return;
		}
		if (hasStart && hasEnd) {
			const start = new Date(data.startTime!);
			const end = new Date(data.endTime!);
			if (start.getTime() >= end.getTime()) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'startTime must be before endTime',
					path: ['endTime'],
				});
			}
		}
	});
