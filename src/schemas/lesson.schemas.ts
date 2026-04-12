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

export const cancelLessonBodySchema = z.object({
	status: z.literal('CANCELLED'),
});

export type CancelLessonBody = z.infer<typeof cancelLessonBodySchema>;

export function parseCancelLessonBody(
	body: unknown,
): { ok: true; data: CancelLessonBody } | { ok: false; error: string } {
	const parsed = cancelLessonBodySchema.safeParse(body);
	if (!parsed.success) {
		const message = parsed.error.issues[0]?.message ?? 'Invalid body';
		return { ok: false, error: message };
	}
	return { ok: true, data: parsed.data };
}
