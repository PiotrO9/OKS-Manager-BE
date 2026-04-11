import { z } from 'zod';
import { UUID_PARAM_RE } from '../lib/validation/uuid';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const instructorIdParamsSchema = z.object({
	instructorId: z.string().regex(UUID_PARAM_RE, 'Invalid instructorId'),
});

// ── Weekly ────────────────────────────────────────────────────────────────────

export const dayOfWeekParamsSchema = z.object({
	instructorId: z.string().regex(UUID_PARAM_RE, 'Invalid instructorId'),
	dayOfWeek: z.coerce
		.number()
		.int('dayOfWeek must be an integer')
		.min(0, 'dayOfWeek must be 0–6')
		.max(6, 'dayOfWeek must be 0–6'),
});

export const putWeeklyBodySchema = z
	.object({
		startTime: z
			.string({ required_error: 'startTime is required' })
			.regex(TIME_RE, 'startTime must be in HH:mm format'),
		endTime: z
			.string({ required_error: 'endTime is required' })
			.regex(TIME_RE, 'endTime must be in HH:mm format'),
	})
	.superRefine((data, ctx) => {
		if (data.startTime >= data.endTime) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'startTime must be before endTime',
				path: ['startTime'],
			});
		}
	});

export type PutWeeklyBody = z.infer<typeof putWeeklyBodySchema>;

export function parsePutWeeklyBody(
	body: unknown,
): { ok: true; data: PutWeeklyBody } | { ok: false; error: string } {
	const parsed = putWeeklyBodySchema.safeParse(body);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? 'Invalid body',
		};
	}
	return { ok: true, data: parsed.data };
}

// ── Exceptions ────────────────────────────────────────────────────────────────

export const exceptionDateParamsSchema = z.object({
	instructorId: z.string().regex(UUID_PARAM_RE, 'Invalid instructorId'),
	date: z.string().regex(DATE_RE, 'date must be in YYYY-MM-DD format'),
});

export const exceptionsQuerySchema = z
	.object({
		from: z
			.string({ required_error: 'from is required' })
			.regex(DATE_RE, 'from must be in YYYY-MM-DD format'),
		to: z
			.string({ required_error: 'to is required' })
			.regex(DATE_RE, 'to must be in YYYY-MM-DD format'),
	})
	.superRefine((data, ctx) => {
		if (data.from > data.to) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'from must be on or before to',
				path: ['from'],
			});
		}
	});

export type ExceptionsQuery = z.infer<typeof exceptionsQuerySchema>;

export const putExceptionBodySchema = z
	.object({
		isDayOff: z.boolean({ required_error: 'isDayOff is required' }),
		startTime: z
			.string()
			.regex(TIME_RE, 'startTime must be in HH:mm format')
			.optional(),
		endTime: z
			.string()
			.regex(TIME_RE, 'endTime must be in HH:mm format')
			.optional(),
	})
	.superRefine((data, ctx) => {
		if (!data.isDayOff) {
			if (!data.startTime) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'startTime is required when isDayOff is false',
					path: ['startTime'],
				});
			}
			if (!data.endTime) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'endTime is required when isDayOff is false',
					path: ['endTime'],
				});
			}
			if (
				data.startTime &&
				data.endTime &&
				data.startTime >= data.endTime
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'startTime must be before endTime',
					path: ['startTime'],
				});
			}
		}
	});

export type PutExceptionBody = z.infer<typeof putExceptionBodySchema>;

export function parsePutExceptionBody(
	body: unknown,
): { ok: true; data: PutExceptionBody } | { ok: false; error: string } {
	const parsed = putExceptionBodySchema.safeParse(body);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? 'Invalid body',
		};
	}
	return { ok: true, data: parsed.data };
}

// ── Compute ───────────────────────────────────────────────────────────────────

export const computeQuerySchema = z.object({
	date: z
		.string({ required_error: 'date is required' })
		.regex(DATE_RE, 'date must be in YYYY-MM-DD format'),
});

export type ComputeQuery = z.infer<typeof computeQuerySchema>;

// ── Slots ─────────────────────────────────────────────────────────────────────

const MAX_SLOT_RANGE_DAYS = 30;

export const slotsQuerySchema = z
	.object({
		dateFrom: z
			.string({ required_error: 'dateFrom is required' })
			.regex(DATE_RE, 'dateFrom must be in YYYY-MM-DD format'),
		dateTo: z
			.string({ required_error: 'dateTo is required' })
			.regex(DATE_RE, 'dateTo must be in YYYY-MM-DD format'),
	})
	.superRefine((data, ctx) => {
		if (data.dateFrom > data.dateTo) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'dateFrom must be on or before dateTo',
				path: ['dateFrom'],
			});
			return;
		}

		const parseUtcDateOnly = (s: string): Date => {
			const [y, mo, d] = s.split('-').map(Number);
			return new Date(Date.UTC(y ?? 0, (mo ?? 1) - 1, d ?? 1));
		};

		const from = parseUtcDateOnly(data.dateFrom);
		const to = parseUtcDateOnly(data.dateTo);
		const inclusiveDays =
			Math.floor(
				(to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24),
			) + 1;

		if (inclusiveDays > MAX_SLOT_RANGE_DAYS) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `Date range cannot exceed ${MAX_SLOT_RANGE_DAYS} days`,
				path: ['dateTo'],
			});
		}
	});

export type SlotsQuery = z.infer<typeof slotsQuerySchema>;
