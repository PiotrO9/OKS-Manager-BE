import { z } from 'zod';
import { UUID_PARAM_RE, zodPreprocessQueryFirst } from '../lib/validation/uuid';

export const managerAttentionQuerySchema = z.object({
	schoolId: zodPreprocessQueryFirst(
		z
			.string({ required_error: 'schoolId is required' })
			.trim()
			.min(1, 'schoolId is required')
			.regex(UUID_PARAM_RE, 'Invalid schoolId'),
	),
});

export type ManagerAttentionQuery = z.infer<typeof managerAttentionQuerySchema>;
