import { z } from 'zod';
import {
	schoolIdQuerySchema,
	vehicleIdParamsSchema,
} from '../lib/validation/uuid';

export { vehicleIdParamsSchema };

function isDateYmd(value: string): boolean {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return false;

	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(Date.UTC(year, month - 1, day));

	return (
		date.getUTCFullYear() === year &&
		date.getUTCMonth() === month - 1 &&
		date.getUTCDate() === day
	);
}

const unavailableUntilSchema = z.preprocess(
	(value) => (value === '' || value === undefined ? undefined : value),
	z
		.string()
		.refine(isDateYmd, {
			message: 'unavailableUntil must be a valid YYYY-MM-DD date',
		})
		.nullable()
		.optional(),
);

export const vehicleAvailabilityStatusSchema = z.object({
	status: z.enum(['ACTIVE', 'UNAVAILABLE']),
	unavailableUntil: unavailableUntilSchema,
});

export type VehicleAvailabilityStatusPayload = z.infer<
	typeof vehicleAvailabilityStatusSchema
>;

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
