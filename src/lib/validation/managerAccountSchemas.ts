import { z } from 'zod';

export const managerAccountsQuerySchema = z
	.object({
		schoolId: z.string().uuid(),
		search: z.string().trim().max(120).optional(),
		role: z.enum(['STUDENT', 'INSTRUCTOR']).optional(),
		page: z.coerce.number().int().min(1).max(1_000_000).optional(),
		limit: z.coerce.number().int().min(1).max(100).default(20),
		// Exact lookup for existing links that identify an instructor by profile ID.
		profileId: z.string().uuid().optional(),
	})
	.refine(
		(query) =>
			query.page !== undefined ||
			(query.search === undefined &&
				query.role === undefined &&
				query.profileId === undefined),
		{ message: 'page is required when filtering accounts', path: ['page'] },
	);

export type ManagerAccountsQuery = z.infer<typeof managerAccountsQuerySchema>;
