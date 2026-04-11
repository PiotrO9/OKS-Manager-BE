import { LessonType } from '@prisma/client';
import { z } from 'zod';
import { UUID_PARAM_RE } from '../lib/validation/uuid';

export const bookLessonBodySchema = z
	.object({
		courseId: z.string().regex(UUID_PARAM_RE, 'Invalid courseId'),
		studentId: z.string().regex(UUID_PARAM_RE, 'Invalid studentId'),
		instructorId: z.string().regex(UUID_PARAM_RE, 'Invalid instructorId'),
		startTime: z.string().datetime(),
		endTime: z.string().datetime(),
		lessonType: z.nativeEnum(LessonType),
		vehicleId: z
			.string()
			.regex(UUID_PARAM_RE, 'Invalid vehicleId')
			.optional(),
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
		if (data.lessonType === LessonType.PRACTICE && !data.vehicleId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'vehicleId is required for PRACTICE lessons',
				path: ['vehicleId'],
			});
		}
		if (data.lessonType === LessonType.THEORY && data.vehicleId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'vehicleId must not be set for THEORY lessons',
				path: ['vehicleId'],
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
