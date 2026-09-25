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
