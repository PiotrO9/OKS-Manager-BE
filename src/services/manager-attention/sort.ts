import { dayTime } from './dateUtils';
import type {
	ManagerAttentionItemDto,
	ManagerAttentionItemPriority,
	ManagerAttentionItemType,
	SortableAttentionItem,
} from './types';

export function sortAttentionItems(
	items: SortableAttentionItem[],
): SortableAttentionItem[] {
	const priorityRank: Record<ManagerAttentionItemPriority, number> = {
		urgent: 0,
		todo: 1,
		info: 2,
	};
	const typeRank: Record<ManagerAttentionItemType, number> = {
		payment_overdue: 0,
		vehicle_document_expired: 1,
		low_lesson_rating: 2,
		student_missing_pkk: 3,
		student_missing_course: 4,
		student_missing_first_lesson: 5,
		instructor_missing_availability: 6,
		payment_due_soon: 7,
		vehicle_document_expiring: 8,
	};

	return [...items].sort((a, b) => {
		const priorityDelta =
			priorityRank[a.priority] - priorityRank[b.priority];
		if (priorityDelta !== 0) return priorityDelta;

		const dateDelta = dayTime(a.sortDate) - dayTime(b.sortDate);
		if (dateDelta !== 0) return dateDelta;

		const typeDelta = typeRank[a.type] - typeRank[b.type];
		if (typeDelta !== 0) return typeDelta;

		return a.entityLabel.localeCompare(b.entityLabel, 'pl');
	});
}

export function stripSortDate(
	item: SortableAttentionItem,
): ManagerAttentionItemDto {
	return {
		id: item.id,
		type: item.type,
		priority: item.priority,
		title: item.title,
		description: item.description,
		entityId: item.entityId,
		entityLabel: item.entityLabel,
		dueDate: item.dueDate,
		actionTo: item.actionTo,
	};
}
