import { z } from 'zod';

export const seedVolumeSchema = z.enum(['low', 'default', 'high']);

export const devResetAndSeedBodySchema = z
	.object({
		schools: seedVolumeSchema.optional(),
		instructors: seedVolumeSchema.optional(),
		students: seedVolumeSchema.optional(),
		vehicles: seedVolumeSchema.optional(),
		courses: seedVolumeSchema.optional(),
		courseParticipants: seedVolumeSchema.optional(),
		lessons: seedVolumeSchema.optional(),
		events: seedVolumeSchema.optional(),
		timeBlocks: seedVolumeSchema.optional(),
		randomSeed: z.string().trim().min(1).max(100).optional(),
	})
	.strict()
	.default({});

export type DevResetAndSeedBody = z.infer<typeof devResetAndSeedBodySchema>;

export const auditOperationSchema = z.discriminatedUnion('kind', [
	z
		.object({
			kind: z.literal('clear'),
			level: z.enum(['managers', 'schools', 'instructors', 'full']),
		})
		.strict(),
	z
		.object({
			kind: z.literal('fixture'),
			fixture: z.enum([
				'manager-only',
				'school-empty',
				'school-staffed',
				'school-operational',
				'booking-ready',
				'payment-ready',
				'account-ready',
			]),
		})
		.strict(),
]);

export const auditPreviewBodySchema = z
	.object({
		operation: auditOperationSchema,
	})
	.strict();

export const auditExecuteBodySchema = z
	.object({
		operation: auditOperationSchema,
		confirmation: z.string().min(1),
		fullConfirmation: z.string().optional(),
	})
	.strict();

export type AuditPreviewBody = z.infer<typeof auditPreviewBodySchema>;
export type AuditExecuteBody = z.infer<typeof auditExecuteBodySchema>;
