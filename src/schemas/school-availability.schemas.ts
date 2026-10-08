import { LessonType } from '@prisma/client';
import { z } from 'zod';
import { UUID_PARAM_RE } from '../lib/validation/uuid';
import {
	refineSlotsDateRange,
	slotsQueryBaseSchema,
} from './instructor-availability.schemas';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function preprocessCommaList(input: unknown): string[] | undefined {
	if (input === undefined || input === null) {
		return undefined;
	}
	if (Array.isArray(input)) {
		return input
			.flatMap((value) => String(value).split(','))
			.map((entry) => entry.trim())
			.filter(Boolean);
	}
	if (typeof input === 'string') {
		const trimmedValue = input.trim();
		if (trimmedValue === '') {
			return undefined;
		}
		return trimmedValue
			.split(',')
			.map((entry) => entry.trim())
			.filter(Boolean);
	}
	return undefined;
}

function preprocessWeekdays(input: unknown): number[] | undefined {
	const weekdayEntries = preprocessCommaList(input);
	if (weekdayEntries === undefined) {
		return undefined;
	}
	const weekdays = weekdayEntries.map((entry) => Number.parseInt(entry, 10));
	if (
		weekdays.some(
			(parsedInteger) =>
				Number.isNaN(parsedInteger) ||
				parsedInteger < 0 ||
				parsedInteger > 6,
		)
	) {
		return undefined;
	}
	return [...new Set(weekdays)].sort((a, b) => a - b);
}

function zodPreprocessOptionalPositiveInt<T extends z.ZodNumber>(schema: T) {
	return z.preprocess((input) => {
		if (input === undefined || input === null || input === '') {
			return undefined;
		}
		if (typeof input === 'number') {
			return input;
		}
		if (typeof input === 'string') {
			const parsedInteger = Number.parseInt(input, 10);
			return Number.isNaN(parsedInteger) ? input : parsedInteger;
		}
		return input;
	}, schema.optional());
}

function zodPreprocessOptionalNonNegInt<T extends z.ZodNumber>(schema: T) {
	return z.preprocess((input) => {
		if (input === undefined || input === null || input === '') {
			return undefined;
		}
		if (typeof input === 'number') {
			return input;
		}
		if (typeof input === 'string') {
			const parsedInteger = Number.parseInt(input, 10);
			return Number.isNaN(parsedInteger) ? input : parsedInteger;
		}
		return input;
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
				(value) =>
					value === '' || value === undefined ? undefined : value,
				z
					.string()
					.regex(TIME_RE, 'timeFrom must be in HH:mm format')
					.optional(),
			),
			timeTo: z.preprocess(
				(value) =>
					value === '' || value === undefined ? undefined : value,
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
				(value) =>
					value === '' || value === undefined ? undefined : value,
				z.string().regex(UUID_PARAM_RE, 'Invalid courseId').optional(),
			),
			lessonType: z.preprocess(
				(value) =>
					value === '' || value === undefined ? undefined : value,
				z.enum(LESSON_TYPE_VALUES).optional(),
			),
			sort: z
				.preprocess(
					(value) =>
						value === '' || value === undefined
							? 'startTime'
							: value,
					z.enum(['startTime', 'instructorName']),
				)
				.default('startTime'),
			limit: zodPreprocessOptionalPositiveInt(
				z.number().int().min(1).max(500),
			),
			offset: zodPreprocessOptionalNonNegInt(z.number().int().min(0)),
			excludeMyLessons: z.preprocess((value) => {
				if (value === undefined || value === null || value === '') {
					return undefined;
				}
				if (typeof value === 'boolean') {
					return value;
				}
				if (typeof value === 'string') {
					const trimmedValue = value.trim().toLowerCase();
					if (trimmedValue === 'true' || trimmedValue === '1') {
						return true;
					}
					if (trimmedValue === 'false' || trimmedValue === '0') {
						return false;
					}
				}
				return value;
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
