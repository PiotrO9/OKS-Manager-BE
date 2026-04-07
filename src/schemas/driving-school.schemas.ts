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

export const createDrivingSchoolBodySchema = z
	.object({})
	.passthrough()
	.superRefine((body, ctx) => {
		const name = body['name'];
		if (typeof name !== 'string' || name.trim() === '') {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Name is required',
			});
		}
		const city = body['city'];
		if (city !== undefined && city !== null && typeof city !== 'string') {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'city must be a string or null',
				path: ['city'],
			});
		}
		const address = body['address'];
		if (
			address !== undefined &&
			address !== null &&
			typeof address !== 'string'
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'address must be a string or null',
				path: ['address'],
			});
		}
	})
	.transform((body) => {
		const name = String(body['name']).trim();
		const rawCity = body['city'];
		const city =
			rawCity === undefined || rawCity === null
				? null
				: (rawCity as string).trim() === ''
					? null
					: (rawCity as string).trim();
		const rawAddress = body['address'];
		const address =
			rawAddress === undefined || rawAddress === null
				? null
				: (rawAddress as string).trim() === ''
					? null
					: (rawAddress as string).trim();
		return { name, city, address };
	});

export const updateDrivingSchoolBodySchema = z
	.object({
		name: z.unknown().optional(),
		city: z.unknown().optional(),
		address: z.unknown().optional(),
	})
	.superRefine((data, ctx) => {
		const keys = Object.keys(data).filter(
			(k) => data[k as keyof typeof data] !== undefined,
		);
		if (keys.length === 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'No fields to update',
			});
		}

		if (data.name !== undefined) {
			if (typeof data.name !== 'string' || data.name.trim() === '') {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Name cannot be empty',
					path: ['name'],
				});
			}
		}
		if (
			data.city !== undefined &&
			data.city !== null &&
			typeof data.city !== 'string'
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'city must be a string or null',
				path: ['city'],
			});
		}
		if (
			data.address !== undefined &&
			data.address !== null &&
			typeof data.address !== 'string'
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'address must be a string or null',
				path: ['address'],
			});
		}
	})
	.transform((raw) => {
		const out: {
			name?: string;
			city?: string | null;
			address?: string | null;
		} = {};

		if (raw.name !== undefined && typeof raw.name === 'string') {
			out.name = raw.name.trim();
		}
		if (raw.city !== undefined) {
			if (raw.city === null) {
				out.city = null;
			} else {
				const t = (raw.city as string).trim();
				out.city = t === '' ? null : t;
			}
		}
		if (raw.address !== undefined) {
			if (raw.address === null) {
				out.address = null;
			} else {
				const t = (raw.address as string).trim();
				out.address = t === '' ? null : t;
			}
		}

		return out;
	});
