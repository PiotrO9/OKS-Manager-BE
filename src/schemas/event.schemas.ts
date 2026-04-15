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
		capacity: z
			.number()
			.int('capacity must be an integer')
			.min(0, 'capacity must be >= 0')
			.optional(),
		/** Opcjonalnie: wydarzenie teorii powiązane z kursem (`Course.id`). Nie przypisuje uczestników — użyj `POST` / `PUT` `/events/:id/students`. */
		courseId: z
			.string()
			.regex(UUID_PARAM_RE, 'Invalid courseId')
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
		if (data.courseId !== undefined && data.type !== EventType.THEORY) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'courseId is only allowed for THEORY events',
				path: ['courseId'],
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

export const patchInstructorEventBodySchema = z
	.object({
		instructorId: z
			.string()
			.regex(UUID_PARAM_RE, 'Invalid instructorId')
			.optional(),
		type: z.nativeEnum(EventType).optional(),
		startTime: z.string().datetime().optional(),
		endTime: z.string().datetime().optional(),
		vehicleId: z
			.string()
			.regex(UUID_PARAM_RE, 'Invalid vehicleId')
			.nullable()
			.optional(),
		capacity: z
			.number()
			.int('capacity must be an integer')
			.min(0, 'capacity must be >= 0')
			.nullable()
			.optional(),
	})
	.superRefine((data, ctx) => {
		if (data.startTime && data.endTime) {
			const start = new Date(data.startTime);
			const end = new Date(data.endTime);
			if (start.getTime() >= end.getTime()) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'startTime must be before endTime',
					path: ['startTime'],
				});
			}
		}
	});

export type PatchInstructorEventBody = z.infer<
	typeof patchInstructorEventBodySchema
>;

export function parsePatchInstructorEventBody(
	body: unknown,
): { ok: true; data: PatchInstructorEventBody } | { ok: false; error: string } {
	const parsed = patchInstructorEventBodySchema.safeParse(body);
	if (!parsed.success) {
		return {
			ok: false,
			error: parsed.error.issues[0]?.message ?? 'Invalid body',
		};
	}
	return { ok: true, data: parsed.data };
}

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

/** PUT `/events/:id/students` — pełna zamiana listy; pusta tablica usuwa wszystkich uczestników. */
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

/** GET `/events/:id` — opcjonalnie `includeSlots=true` dla `freeWindows` w odpowiedzi. */
export const getEventQuerySchema = z.object({
	includeSlots: z.enum(['true', 'false']).optional(),
});

export type GetEventQuery = z.infer<typeof getEventQuerySchema>;

/** GET `/events/:id/eligible-students` — opcjonalne nadpisanie okna czasowego przy liczeniu kolizji kursantów. */
export const eligibleStudentsQuerySchema = z
	.object({
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

export type EligibleStudentsQuery = z.infer<typeof eligibleStudentsQuerySchema>;
