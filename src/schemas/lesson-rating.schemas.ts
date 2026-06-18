import { z } from 'zod';
import {
	UUID_PARAM_RE,
	zodPreprocessQueryFirst,
} from '../lib/validation/uuid';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const optionalDateQueryValue = zodPreprocessQueryFirst(
	z.preprocess(
		(val) => (val === '' || val === null ? undefined : val),
		z.string().regex(DATE_RE, 'date must be in YYYY-MM-DD format').optional(),
	),
).optional();

const optionalUuidQueryValue = (message: string) =>
	zodPreprocessQueryFirst(
		z.preprocess(
			(val) => (val === '' || val === null ? undefined : val),
			z.string().trim().regex(UUID_PARAM_RE, message).optional(),
		),
	).optional();

export const lessonRatingsPeriodSchema = z.enum([
	'latest',
	'yesterday',
	'last7days',
	'all',
]);

const lessonRatingsBaseQuerySchema = z.object({
		schoolId: zodPreprocessQueryFirst(
			z
				.string({ required_error: 'schoolId is required' })
				.trim()
				.min(1, 'schoolId is required')
				.regex(UUID_PARAM_RE, 'Invalid schoolId'),
		),
		instructorId: optionalUuidQueryValue('Invalid instructorId'),
		period: zodPreprocessQueryFirst(
			lessonRatingsPeriodSchema.default('latest'),
		),
		dateFrom: optionalDateQueryValue,
		dateTo: optionalDateQueryValue,
		limit: zodPreprocessQueryFirst(
			z.coerce.number().int().min(1).max(100).default(50),
		),
	});

function refineDateRange(
	data: { dateFrom?: string; dateTo?: string },
	ctx: z.RefinementCtx,
) {
		const hasFrom = data.dateFrom !== undefined;
		const hasTo = data.dateTo !== undefined;
		if (hasFrom !== hasTo) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					'Both dateFrom and dateTo are required when filtering by date range',
				path: hasFrom ? ['dateTo'] : ['dateFrom'],
			});
			return;
		}
		if (hasFrom && data.dateFrom! > data.dateTo!) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'dateFrom must be on or before dateTo',
				path: ['dateFrom'],
			});
		}
}

export const listLessonRatingsQuerySchema =
	lessonRatingsBaseQuerySchema.superRefine(refineDateRange);

export const instructorLessonRatingsQuerySchema =
	lessonRatingsBaseQuerySchema
		.omit({ instructorId: true })
		.superRefine(refineDateRange);

export type ListLessonRatingsQuery = z.infer<
	typeof listLessonRatingsQuerySchema
>;

export type InstructorLessonRatingsQuery = z.infer<
	typeof instructorLessonRatingsQuerySchema
>;
