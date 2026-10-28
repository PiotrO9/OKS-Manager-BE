import type { SecurityLogFilters } from '../../schemas/security-log.schemas';

export type ListInput = {
	schoolId: string;
	limit: number;
	cursor?: string;
	search: string;
	view: string;
	filters: SecurityLogFilters;
};
