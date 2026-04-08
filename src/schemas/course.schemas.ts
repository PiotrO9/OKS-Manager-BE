import { z } from 'zod';
import { UUID_PARAM_RE } from '../lib/validation/uuid';

const courseKindSchema = z.enum(['THEORY_GROUP', 'PRACTICAL', 'EXTRA']);

export const createCourseBodySchema = z
	.object({
		schoolId: z
			.string({ required_error: 'schoolId is required' })
			.trim()
			.regex(UUID_PARAM_RE, 'Invalid schoolId'),
		name: z
			.string({ required_error: 'name is required' })
			.trim()
			.min(1, 'name is required'),
		category: z
			.string({ required_error: 'category is required' })
			.trim()
			.min(1, 'category is required'),
		kind: courseKindSchema,
		totalHours: z
			.number({ required_error: 'totalHours is required' })
			.int('totalHours must be an integer')
			.positive('totalHours must be > 0'),
		capacity: z
			.number()
			.int('capacity must be an integer')
			.min(0, 'capacity must be >= 0')
			.optional()
			.nullable(),
		instructorId: z
			.string()
			.trim()
			.regex(UUID_PARAM_RE, 'Invalid instructorId')
			.optional()
			.nullable(),
		theoryStartDate: z.coerce.date().optional().nullable(),
		theoryEndDate: z.coerce.date().optional().nullable(),
	})
	.superRefine((data, ctx) => {
		if (
			(data.kind === 'PRACTICAL' || data.kind === 'EXTRA') &&
			data.capacity != null
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'capacity is only allowed for THEORY_GROUP courses',
				path: ['capacity'],
			});
		}

		if (data.kind === 'THEORY_GROUP') {
			if (!data.theoryStartDate || !data.theoryEndDate) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message:
						'theoryStartDate and theoryEndDate are required for THEORY_GROUP',
					path: ['theoryStartDate'],
				});
				return;
			}
			const start = data.theoryStartDate.getTime();
			const end = data.theoryEndDate.getTime();
			if (end < start) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message:
						'theoryEndDate must be on or after theoryStartDate',
					path: ['theoryEndDate'],
				});
			}
		} else if (data.theoryStartDate != null || data.theoryEndDate != null) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					'theoryStartDate and theoryEndDate are only for THEORY_GROUP',
				path: ['theoryStartDate'],
			});
		}
	});

export type CreateCourseBody = z.infer<typeof createCourseBodySchema>;

export function parseCreateCourseBody(
	body: unknown,
): { ok: true; data: CreateCourseBody } | { ok: false; error: string } {
	const parsed = createCourseBodySchema.safeParse(body);
	if (!parsed.success) {
		const message = parsed.error.issues[0]?.message ?? 'Invalid body';
		return { ok: false, error: message };
	}
	return { ok: true, data: parsed.data };
}

/** Partial update: brak klucza = brak zmiany danego pola (`instructorId`, `capacity`). */
export const patchCourseBodySchema = z.object({
	instructorId: z
		.string()
		.trim()
		.regex(UUID_PARAM_RE, 'Invalid instructorId')
		.nullable()
		.optional(),
	capacity: z
		.number()
		.int('capacity must be an integer')
		.min(0, 'capacity must be >= 0')
		.optional()
		.nullable(),
});

export type PatchCourseBody = z.infer<typeof patchCourseBodySchema>;

export function parsePatchCourseBody(
	body: unknown,
): { ok: true; data: PatchCourseBody } | { ok: false; error: string } {
	const parsed = patchCourseBodySchema.safeParse(body);
	if (!parsed.success) {
		const message = parsed.error.issues[0]?.message ?? 'Invalid body';
		return { ok: false, error: message };
	}
	return { ok: true, data: parsed.data };
}
