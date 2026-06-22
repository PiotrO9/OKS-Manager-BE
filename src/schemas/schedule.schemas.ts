import { z } from 'zod';
import { UUID_PARAM_RE } from '../lib/validation/uuid';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const scheduleMeQuerySchema = z
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
		}
	});

export const scheduleQuerySchema = z
	.object({
		dateFrom: z
			.string({ required_error: 'dateFrom is required' })
			.regex(DATE_RE, 'dateFrom must be in YYYY-MM-DD format'),
		dateTo: z
			.string({ required_error: 'dateTo is required' })
			.regex(DATE_RE, 'dateTo must be in YYYY-MM-DD format'),
		instructorId: z
			.string()
			.regex(UUID_PARAM_RE, 'Invalid instructorId')
			.optional(),
		studentId: z
			.string()
			.regex(UUID_PARAM_RE, 'Invalid studentId')
			.optional(),
		schoolId: z.string().regex(UUID_PARAM_RE, 'Invalid schoolId').optional(),
	})
	.superRefine((data, ctx) => {
		if (data.dateFrom > data.dateTo) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'dateFrom must be on or before dateTo',
				path: ['dateFrom'],
			});
		}
		const hasI = data.instructorId !== undefined;
		const hasS = data.studentId !== undefined;
		if (hasI === hasS) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Provide exactly one of instructorId or studentId',
				path: ['instructorId'],
			});
		}
		if (hasS && data.schoolId === undefined) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'schoolId is required when filtering by studentId',
				path: ['schoolId'],
			});
		}
	});

export type ScheduleMeQuery = z.infer<typeof scheduleMeQuerySchema>;
export type ScheduleManagerQuery = z.infer<typeof scheduleQuerySchema>;
