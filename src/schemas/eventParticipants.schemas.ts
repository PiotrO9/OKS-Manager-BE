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
