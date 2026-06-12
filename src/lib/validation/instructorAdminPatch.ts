import { z } from 'zod';
import { UUID_PARAM_RE } from './uuid';

export const qualifiedCourseTypeIdsFieldSchema = z
	.array(
		z.string().regex(UUID_PARAM_RE, 'Invalid qualifiedCourseTypeIds entry'),
	)
	.transform((arr) => [...new Set(arr)]);

/** Body dla `PATCH /instructors/:id` (MANAGER / ADMIN). Nieznane klucze są usuwane (.strip). */
export const instructorAdminPatchBodySchema = z
	.object({
		firstName: z
			.string()
			.trim()
			.min(1, 'firstName must not be empty')
			.optional(),
		lastName: z
			.string()
			.trim()
			.min(1, 'lastName must not be empty')
			.optional(),
		experienceYears: z
			.number()
			.int('experienceYears must be an integer')
			.min(0, 'experienceYears must be >= 0')
			.max(80, 'experienceYears must be <= 80')
			.optional(),
		qualifications: z.string().optional(),
		qualifiedCourseTypeIds: qualifiedCourseTypeIdsFieldSchema.optional(),
	})
	.strip();

export type InstructorAdminPatchBody = z.infer<
	typeof instructorAdminPatchBodySchema
>;
