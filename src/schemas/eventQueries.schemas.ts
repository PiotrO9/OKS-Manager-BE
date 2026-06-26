import { EventStatus } from '@prisma/client';
import { z } from 'zod';
import { UUID_PARAM_RE } from '../lib/validation/uuid';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const listEventsStatusQuery = z.preprocess(
	(v) => {
		if (v === undefined || v === '') {
			return undefined;
		}
		if (Array.isArray(v)) {
			return v;
		}
		if (typeof v === 'string') {
			return v
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);
		}
		return v;
	},
	z.array(z.nativeEnum(EventStatus)).min(1).max(4).optional(),
);

export const listEventsQuerySchema = z
	.object({
		dateFrom: z
			.string({ required_error: 'dateFrom is required' })
			.regex(DATE_RE, 'dateFrom must be in YYYY-MM-DD format'),
		dateTo: z
			.string({ required_error: 'dateTo is required' })
			.regex(DATE_RE, 'dateTo must be in YYYY-MM-DD format'),
		status: listEventsStatusQuery,
		instructorId: z
			.string()
			.regex(UUID_PARAM_RE, 'Invalid instructorId')
			.optional(),
	})
	.superRefine((data, ctx) => {
		if (data.dateFrom > data.dateTo) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'dateFrom must be on or before dateTo',
				path: ['dateFrom'],
			});
		}
	});

export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;

export const getEventQuerySchema = z.object({
	includeSlots: z.enum(['true', 'false']).optional(),
});

export type GetEventQuery = z.infer<typeof getEventQuerySchema>;

export const eligibleStudentsQuerySchema = z
	.object({
		startTime: z.string().datetime().optional(),
		endTime: z.string().datetime().optional(),
	})
	.superRefine((data, ctx) => {
		const hasStart = data.startTime !== undefined;
		const hasEnd = data.endTime !== undefined;
		if (hasStart !== hasEnd) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					'Both startTime and endTime are required when overriding the event window',
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
					path: ['startTime'],
				});
			}
		}
	});

export type EligibleStudentsQuery = z.infer<typeof eligibleStudentsQuerySchema>;
