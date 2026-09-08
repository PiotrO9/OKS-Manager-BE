import { Role } from '@prisma/client';
import { assertManagerCanAccessSchool } from './access';
import { startOfLocalDay } from './dateUtils';
import {
	buildInstructorItems,
	buildPaymentItems,
	buildRatingItems,
	buildStudentItems,
	buildVehicleItems,
} from './items';
import { sortAttentionItems, stripSortDate } from './sort';
import type { ManagerAttentionResultDto } from './types';

const MAX_DASHBOARD_ITEMS = 10;

type AttentionBuildOptions = {
	today?: Date;
};

export async function listManagerAttentionItems(
	actorId: string,
	actorRole: Role,
	schoolId: string,
	options: AttentionBuildOptions = {},
): Promise<ManagerAttentionResultDto> {
	await assertManagerCanAccessSchool(actorId, actorRole, schoolId);

	const today = startOfLocalDay(options.today ?? new Date());
	const itemGroups = await Promise.all([
		buildStudentItems(schoolId),
		buildPaymentItems(schoolId, today),
		buildVehicleItems(schoolId, today),
		buildInstructorItems(schoolId, today),
		buildRatingItems(schoolId, today),
	]);
	const sorted = sortAttentionItems(itemGroups.flat());
	const visible = sorted.slice(0, MAX_DASHBOARD_ITEMS).map(stripSortDate);

	return {
		items: visible,
		total: sorted.length,
		hiddenCount: Math.max(0, sorted.length - visible.length),
	};
}
