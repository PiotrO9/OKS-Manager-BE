import { LessonType } from '@prisma/client';
import { z } from 'zod';
import { UUID_PARAM_RE } from '../lib/validation/uuid';
import {
	refineSlotsDateRange,
	slotsQueryBaseSchema,
} from './instructor-availability.schemas';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function preprocessCommaList(val: unknown): string[] | undefined {
	if (val === undefined || val === null) {
		return undefined;
	}
	if (Array.isArray(val)) {
		return val
			.flatMap((v) => String(v).split(','))
			.map((s) => s.trim())
			.filter(Boolean);
	}
	if (typeof val === 'string') {
		const t = val.trim();
		if (t === '') {
			return undefined;
		}
		return t
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);
	}
	return undefined;
}

function preprocessWeekdays(val: unknown): number[] | undefined {
	const raw = preprocessCommaList(val);
	if (raw === undefined) {
		return undefined;
	}
	const nums = raw.map((s) => Number.parseInt(s, 10));
	if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 6)) {
		return undefined;
	}
	return [...new Set(nums)].sort((a, b) => a - b);
}

function zodPreprocessOptionalPositiveInt<T extends z.ZodNumber>(schema: T) {
	return z.preprocess((val) => {
		if (val === undefined || val === null || val === '') {
			return undefined;
		}
		if (typeof val === 'number') {
			return val;
		}
		if (typeof val === 'string') {
			const n = Number.parseInt(val, 10);
			return Number.isNaN(n) ? val : n;
		}
		return val;
	}, schema.optional());
}

function zodPreprocessOptionalNonNegInt<T extends z.ZodNumber>(schema: T) {
	return z.preprocess((val) => {
		if (val === undefined || val === null || val === '') {
			return undefined;
		}
		if (typeof val === 'number') {
			return val;
		}
		if (typeof val === 'string') {
			const n = Number.parseInt(val, 10);
			return Number.isNaN(n) ? val : n;
		}
		return val;
	}, schema.optional());
}

const LESSON_TYPE_VALUES = [LessonType.THEORY, LessonType.PRACTICE] as const;

export const schoolAvailabilitySlotsQuerySchema = slotsQueryBaseSchema
	.merge(
		z.object({
			instructorIds: z.preprocess(
				preprocessCommaList,
				z
					.array(
						z
							.string()
							.regex(
								UUID_PARAM_RE,
								'Invalid instructorIds entry',
							),
					)
					.optional(),
			),
			timeFrom: z.preprocess(
				(v) => (v === '' || v === undefined ? undefined : v),
				z
					.string()
					.regex(TIME_RE, 'timeFrom must be in HH:mm format')
					.optional(),
			),
			timeTo: z.preprocess(
				(v) => (v === '' || v === undefined ? undefined : v),
				z
					.string()
					.regex(TIME_RE, 'timeTo must be in HH:mm format')
					.optional(),
			),
			weekdays: z.preprocess(
				preprocessWeekdays,
				z.array(z.number().int().min(0).max(6)).optional(),
			),
			slotDurationMinutes: zodPreprocessOptionalPositiveInt(
				z.number().int().min(15).max(240),
			),
			courseId: z.preprocess(
				(v) => (v === '' || v === undefined ? undefined : v),
				z.string().regex(UUID_PARAM_RE, 'Invalid courseId').optional(),
			),
			lessonType: z.preprocess(
				(v) => (v === '' || v === undefined ? undefined : v),
				z.enum(LESSON_TYPE_VALUES).optional(),
			),
			sort: z
				.preprocess(
					(v) => (v === '' || v === undefined ? 'startTime' : v),
					z.enum(['startTime', 'instructorName']),
				)
				.default('startTime'),
			limit: zodPreprocessOptionalPositiveInt(
				z.number().int().min(1).max(500),
			),
			offset: zodPreprocessOptionalNonNegInt(z.number().int().min(0)),
			excludeMyLessons: z.preprocess((v) => {
				if (v === undefined || v === null || v === '') {
					return undefined;
				}
				if (typeof v === 'boolean') {
					return v;
				}
				if (typeof v === 'string') {
					const t = v.trim().toLowerCase();
					if (t === 'true' || t === '1') {
						return true;
					}
					if (t === 'false' || t === '0') {
						return false;
					}
				}
				return v;
			}, z.boolean().optional()),
		}),
	)
	.superRefine(
		(
			data: {
				dateFrom: string;
				dateTo: string;
				timeFrom?: string;
				timeTo?: string;
			},
			ctx: z.RefinementCtx,
		) => {
			refineSlotsDateRange(data, ctx);
			if (data.timeFrom && data.timeTo && data.timeFrom >= data.timeTo) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'timeFrom must be before timeTo',
					path: ['timeTo'],
				});
			}
		},
	);

export type SchoolAvailabilitySlotsQuery = z.infer<
	typeof schoolAvailabilitySlotsQuerySchema
>;
