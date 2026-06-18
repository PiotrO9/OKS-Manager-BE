import { z } from 'zod';
import { UUID_PARAM_RE } from '../lib/validation/uuid';

export const bookLessonBodySchema = z
	.object({
		courseId: z.string().regex(UUID_PARAM_RE, 'Invalid courseId'),
		studentId: z.string().regex(UUID_PARAM_RE, 'Invalid studentId'),
		instructorId: z.string().regex(UUID_PARAM_RE, 'Invalid instructorId'),
		startTime: z.string().datetime(),
		endTime: z.string().datetime(),
		/** Rezerwacje lekcji dotyczą wyłącznie jazdy; teoria jest wyłącznie przez `POST /events`. */
		lessonType: z.literal('PRACTICE'),
		vehicleId: z.string().regex(UUID_PARAM_RE, 'Invalid vehicleId'),
	})
	.superRefine((data, ctx) => {
		const start = new Date(data.startTime);
		const end = new Date(data.endTime);
		if (start.getTime() >= end.getTime()) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'startTime must be before endTime',
				path: ['startTime'],
			});
		}
	});

export type BookLessonBody = z.infer<typeof bookLessonBodySchema>;

export function parseBookLessonBody(
	body: unknown,
): { ok: true; data: BookLessonBody } | { ok: false; error: string } {
	const parsed = bookLessonBodySchema.safeParse(body);
	if (!parsed.success) {
		const message = parsed.error.issues[0]?.message ?? 'Invalid body';
		return { ok: false, error: message };
	}
	return { ok: true, data: parsed.data };
}

export const bookOwnLessonBodySchema = z
	.object({
		courseId: z.string().regex(UUID_PARAM_RE, 'Invalid courseId'),
		instructorId: z.string().regex(UUID_PARAM_RE, 'Invalid instructorId'),
		startTime: z.string().datetime(),
		endTime: z.string().datetime(),
	})
	.strict()
	.superRefine((data, ctx) => {
		const start = new Date(data.startTime);
		const end = new Date(data.endTime);
		if (start.getTime() >= end.getTime()) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'startTime must be before endTime',
				path: ['startTime'],
			});
		}
	});

export type BookOwnLessonBody = z.infer<typeof bookOwnLessonBodySchema>;

export function parseBookOwnLessonBody(
	body: unknown,
): { ok: true; data: BookOwnLessonBody } | { ok: false; error: string } {
	const parsed = bookOwnLessonBodySchema.safeParse(body);
	if (!parsed.success) {
		const message = parsed.error.issues[0]?.message ?? 'Invalid body';
		return { ok: false, error: message };
	}
	return { ok: true, data: parsed.data };
}

export const lessonRatingParamsSchema = z.object({
	lessonId: z.string().trim().regex(UUID_PARAM_RE, 'Invalid lesson id'),
});

export const createLessonRatingBodySchema = z
	.object({
		rating: z.number().int().min(1).max(5),
		comment: z
			.preprocess((val) => {
				if (val === undefined || val === null) {
					return null;
				}
				if (typeof val !== 'string') {
					return val;
				}
				const trimmed = val.trim();
				return trimmed.length > 0 ? trimmed : null;
			}, z.string().max(5000, 'comment must not exceed 5000 characters').nullable())
			.optional()
			.default(null),
	})
	.strict();

export type CreateLessonRatingBody = z.infer<
	typeof createLessonRatingBodySchema
>;

export function parseCreateLessonRatingBody(
	body: unknown,
): { ok: true; data: CreateLessonRatingBody } | { ok: false; error: string } {
	const parsed = createLessonRatingBodySchema.safeParse(body);
	if (!parsed.success) {
		const message = parsed.error.issues[0]?.message ?? 'Invalid body';
		return { ok: false, error: message };
	}
	return { ok: true, data: parsed.data };
}

export const cancelLessonBodySchema = z
	.object({
		status: z.literal('CANCELLED'),
	})
	.strict();

export type CancelLessonBody = z.infer<typeof cancelLessonBodySchema>;

export const updateLessonBodySchema = z
	.object({
		startTime: z.string().datetime().optional(),
		endTime: z.string().datetime().optional(),
		instructorId: z
			.string()
			.regex(UUID_PARAM_RE, 'Invalid instructorId')
			.optional(),
		vehicleId: z
			.string()
			.regex(UUID_PARAM_RE, 'Invalid vehicleId')
			.optional(),
	})
	.strict()
	.superRefine((data, ctx) => {
		const hasAny =
			data.startTime !== undefined ||
			data.endTime !== undefined ||
			data.instructorId !== undefined ||
			data.vehicleId !== undefined;
		if (!hasAny) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					'At least one of startTime, endTime, instructorId, vehicleId is required',
			});
		}
		const hasStart = data.startTime !== undefined;
		const hasEnd = data.endTime !== undefined;
		if (hasStart !== hasEnd) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'startTime and endTime must both be provided together',
				path: hasStart ? ['endTime'] : ['startTime'],
			});
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

export type UpdateLessonBody = z.infer<typeof updateLessonBodySchema>;

export const patchLessonBodySchema = z.union([
	cancelLessonBodySchema,
	updateLessonBodySchema,
]);

export type PatchLessonBody = z.infer<typeof patchLessonBodySchema>;

export function parsePatchLessonBody(
	body: unknown,
): { ok: true; data: PatchLessonBody } | { ok: false; error: string } {
	const parsed = patchLessonBodySchema.safeParse(body);
	if (!parsed.success) {
		const message = parsed.error.issues[0]?.message ?? 'Invalid body';
		return { ok: false, error: message };
	}
	return { ok: true, data: parsed.data };
}
