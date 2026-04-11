import { EventType } from '@prisma/client';
import { z } from 'zod';
import { UUID_PARAM_RE } from '../lib/validation/uuid';

export const createInstructorEventBodySchema = z
	.object({
		instructorId: z.string().regex(UUID_PARAM_RE, 'Invalid instructorId'),
		type: z.nativeEnum(EventType),
		startTime: z.string().datetime(),
		endTime: z.string().datetime(),
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
		if (data.type === EventType.DRIVE && !data.vehicleId) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'vehicleId is required for DRIVE events',
				path: ['vehicleId'],
			});
		}
	});

export type CreateInstructorEventBody = z.infer<
	typeof createInstructorEventBodySchema
>;

export function parseCreateInstructorEventBody(
	body: unknown,
):
	| { ok: true; data: CreateInstructorEventBody }
	| { ok: false; error: string } {
	const parsed = createInstructorEventBodySchema.safeParse(body);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? 'Invalid body',
		};
	}
	return { ok: true, data: parsed.data };
}
