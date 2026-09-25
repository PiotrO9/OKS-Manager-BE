import { z } from 'zod';
import { UUID_PARAM_RE } from '../lib/validation/uuid';

export const assignStudentsBodySchema = z.object({
	studentIds: z
		.array(z.string().regex(UUID_PARAM_RE, 'Invalid studentId'))
		.min(1, 'studentIds must not be empty')
		.max(50, 'studentIds must not exceed 50 entries'),
});

export type AssignStudentsBody = z.infer<typeof assignStudentsBodySchema>;

export function parseAssignStudentsBody(
	body: unknown,
): { ok: true; data: AssignStudentsBody } | { ok: false; error: string } {
	const parsed = assignStudentsBodySchema.safeParse(body);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? 'Invalid body',
		};
	}
	return { ok: true, data: parsed.data };
}

export const replaceEventStudentsBodySchema = z.object({
	studentIds: z
		.array(z.string().regex(UUID_PARAM_RE, 'Invalid studentId'))
		.max(50, 'studentIds must not exceed 50 entries'),
});

export type ReplaceEventStudentsBody = z.infer<
	typeof replaceEventStudentsBodySchema
>;

export const eventStudentsAvailabilityCheckBodySchema =
	replaceEventStudentsBodySchema
		.extend({
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

			if (
				hasStart &&
				hasEnd &&
				new Date(data.startTime!).getTime() >=
					new Date(data.endTime!).getTime()
			) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'startTime must be before endTime',
					path: ['startTime'],
				});
			}
		});

export type EventStudentsAvailabilityCheckBody = z.infer<
	typeof eventStudentsAvailabilityCheckBodySchema
>;

export function parseReplaceEventStudentsBody(
	body: unknown,
): { ok: true; data: ReplaceEventStudentsBody } | { ok: false; error: string } {
	const parsed = replaceEventStudentsBodySchema.safeParse(body);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? 'Invalid body',
		};
	}
	return { ok: true, data: parsed.data };
}
