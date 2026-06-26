import { z } from 'zod';
import { UUID_PARAM_RE, zodPreprocessQueryFirst } from './uuidCore';

export const schoolIdQuerySchema = z.object({
	schoolId: zodPreprocessQueryFirst(
		z
			.string({ required_error: 'schoolId is required' })
			.min(1, 'schoolId is required')
			.regex(UUID_PARAM_RE, 'Invalid schoolId'),
	),
});

export const vehicleIdParamsSchema = z.object({
	id: z.string().trim().regex(UUID_PARAM_RE, 'Invalid vehicle id'),
});

export const instructorIdParamsSchema = z.object({
	id: z.string().trim().regex(UUID_PARAM_RE, 'Invalid instructor id'),
});

export const assignInstructorToSchoolBodySchema = z.object({
	schoolId: z.string().trim().regex(UUID_PARAM_RE, 'Invalid schoolId'),
});

export const drivingSchoolIdParamsSchema = z.object({
	id: z.string().trim().regex(UUID_PARAM_RE, 'Invalid driving school id'),
});

export const courseIdParamsSchema = z.object({
	id: z.string().trim().regex(UUID_PARAM_RE, 'Invalid course id'),
});

export const eventIdParamsSchema = z.object({
	id: z.string().trim().regex(UUID_PARAM_RE, 'Invalid event id'),
});

export const eventIdAndStudentUserParamsSchema = z.object({
	id: z.string().trim().regex(UUID_PARAM_RE, 'Invalid event id'),
	studentUserId: z
		.string()
		.trim()
		.regex(UUID_PARAM_RE, 'Invalid student user id'),
});

export const lessonIdParamsSchema = z.object({
	id: z.string().trim().regex(UUID_PARAM_RE, 'Invalid lesson id'),
});
