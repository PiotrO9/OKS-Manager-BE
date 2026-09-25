import { z } from 'zod';
import { EventType } from '@prisma/client';
import { UUID_PARAM_RE } from '../lib/validation/uuid';
import { polishDayBounds } from '../lib/polishScheduleTime';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const scheduleDateSchema = z
	.string()
	.regex(DATE_RE, 'date must be in YYYY-MM-DD format')
	.refine(
		(value) => {
			try {
				polishDayBounds(value);
				return true;
			} catch {
				return false;
			}
		},
		{ message: 'date must be a valid Polish calendar date' },
	);

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
		schoolId: z
			.string()
			.regex(UUID_PARAM_RE, 'Invalid schoolId')
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

const eventCreateAvailabilityCheckBodySchema = z
	.object({
		intent: z.literal('event_create'),
		instructorId: z.string().regex(UUID_PARAM_RE, 'Invalid instructorId'),
		eventType: z.nativeEnum(EventType),
		date: scheduleDateSchema,
		startTime: z
			.string()
			.regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid startTime'),
		endTime: z
			.string()
			.regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid endTime'),
		vehicleId: z
			.string()
			.regex(UUID_PARAM_RE, 'Invalid vehicleId')
			.optional(),
		courseId: z
			.string()
			.regex(UUID_PARAM_RE, 'Invalid courseId')
			.optional(),
	})
	.strict()
	.superRefine((data, ctx) => {
		if (data.eventType === EventType.DRIVE && data.courseId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'courseId is only allowed for THEORY events',
				path: ['courseId'],
			});
		}
		if (data.eventType === EventType.THEORY && data.vehicleId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'vehicleId is only allowed for DRIVE events',
				path: ['vehicleId'],
			});
		}
	});

const eventEditAvailabilityCheckBodySchema = z
	.object({
		intent: z.literal('event_edit'),
		eventId: z.string().regex(UUID_PARAM_RE, 'Invalid eventId'),
		instructorId: z.string().regex(UUID_PARAM_RE, 'Invalid instructorId'),
		date: scheduleDateSchema,
		startTime: z
			.string()
			.regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid startTime'),
		endTime: z
			.string()
			.regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid endTime'),
		vehicleId: z
			.string()
			.regex(UUID_PARAM_RE, 'Invalid vehicleId')
			.optional(),
	})
	.strict();

const lessonEditAvailabilityCheckBodySchema = z
	.object({
		intent: z.literal('lesson_edit'),
		lessonId: z.string().regex(UUID_PARAM_RE, 'Invalid lessonId'),
		instructorId: z.string().regex(UUID_PARAM_RE, 'Invalid instructorId'),
		vehicleId: z.string().regex(UUID_PARAM_RE, 'Invalid vehicleId'),
		date: scheduleDateSchema,
		startTime: z
			.string()
			.regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid startTime'),
		endTime: z
			.string()
			.regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid endTime'),
	})
	.strict();

const lessonCreateAvailabilityCheckBodySchema = z
	.object({
		intent: z.literal('lesson_create'),
		courseId: z.string().regex(UUID_PARAM_RE, 'Invalid courseId'),
		studentId: z.string().regex(UUID_PARAM_RE, 'Invalid studentId'),
		instructorId: z.string().regex(UUID_PARAM_RE, 'Invalid instructorId'),
		vehicleId: z.string().regex(UUID_PARAM_RE, 'Invalid vehicleId'),
		date: scheduleDateSchema,
		startTime: z
			.string()
			.regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid startTime'),
		endTime: z
			.string()
			.regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid endTime'),
	})
	.strict();

const lessonSelfBookAvailabilityCheckBodySchema = z
	.object({
		intent: z.literal('lesson_self_book'),
		courseId: z.string().regex(UUID_PARAM_RE, 'Invalid courseId'),
		instructorId: z.string().regex(UUID_PARAM_RE, 'Invalid instructorId'),
		date: scheduleDateSchema,
		startTime: z
			.string()
			.regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid startTime'),
		endTime: z
			.string()
			.regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid endTime'),
	})
	.strict();

export const scheduleAvailabilityCheckBodySchema = z
	.union([
		eventCreateAvailabilityCheckBodySchema,
		eventEditAvailabilityCheckBodySchema,
		lessonEditAvailabilityCheckBodySchema,
		lessonCreateAvailabilityCheckBodySchema,
		lessonSelfBookAvailabilityCheckBodySchema,
	])
	.superRefine((data, ctx) => {
		if (data.startTime >= data.endTime) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'startTime must be before endTime',
				path: ['endTime'],
			});
		}
	});

export type ScheduleAvailabilityCheckBody = z.infer<
	typeof scheduleAvailabilityCheckBodySchema
>;

const eventCreateAvailabilityOptionsBodySchema = z
	.object({
		intent: z.literal('event_create'),
		instructorId: z.string().regex(UUID_PARAM_RE, 'Invalid instructorId'),
		eventType: z.nativeEnum(EventType),
		date: scheduleDateSchema,
		vehicleId: z
			.string()
			.regex(UUID_PARAM_RE, 'Invalid vehicleId')
			.optional(),
		courseId: z
			.string()
			.regex(UUID_PARAM_RE, 'Invalid courseId')
			.optional(),
	})
	.strict()
	.superRefine((data, ctx) => {
		if (data.eventType === EventType.DRIVE && data.courseId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'courseId is only allowed for THEORY events',
				path: ['courseId'],
			});
		}
		if (data.eventType === EventType.THEORY && data.vehicleId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'vehicleId is only allowed for DRIVE events',
				path: ['vehicleId'],
			});
		}
	});

const eventEditAvailabilityOptionsBodySchema = z
	.object({
		intent: z.literal('event_edit'),
		eventId: z.string().regex(UUID_PARAM_RE, 'Invalid eventId'),
		instructorId: z.string().regex(UUID_PARAM_RE, 'Invalid instructorId'),
		date: scheduleDateSchema,
		vehicleId: z
			.string()
			.regex(UUID_PARAM_RE, 'Invalid vehicleId')
			.optional(),
	})
	.strict();

const lessonEditAvailabilityOptionsBodySchema = z
	.object({
		intent: z.literal('lesson_edit'),
		lessonId: z.string().regex(UUID_PARAM_RE, 'Invalid lessonId'),
		instructorId: z.string().regex(UUID_PARAM_RE, 'Invalid instructorId'),
		date: scheduleDateSchema,
		vehicleId: z
			.string()
			.regex(UUID_PARAM_RE, 'Invalid vehicleId')
			.optional(),
	})
	.strict();

export const scheduleAvailabilityOptionsBodySchema = z.union([
	eventCreateAvailabilityOptionsBodySchema,
	eventEditAvailabilityOptionsBodySchema,
	lessonEditAvailabilityOptionsBodySchema,
]);

export type ScheduleAvailabilityOptionsBody = z.infer<
	typeof scheduleAvailabilityOptionsBodySchema
>;
