import { toIsoDate } from './dateUtils';
import type {
	ManagerAttentionItemPriority,
	ManagerAttentionItemType,
	SortableAttentionItem,
} from './types';

export function personName(user: {
	firstName: string;
	lastName: string;
	email?: string | null;
}): string {
	const name = `${user.firstName} ${user.lastName}`.trim();

	return name || user.email || 'Nieznany użytkownik';
}

export function makeItem(input: {
	id: string;
	type: ManagerAttentionItemType;
	priority: ManagerAttentionItemPriority;
	title: string;
	description: string;
	entityId: string;
	entityLabel: string;
	dueDate?: Date | null;
	actionTo: string;
}): SortableAttentionItem {
	const dueDate = input.dueDate ?? null;

	return {
		id: input.id,
		type: input.type,
		priority: input.priority,
		title: input.title,
		description: input.description,
		entityId: input.entityId,
		entityLabel: input.entityLabel,
		dueDate: toIsoDate(dueDate),
		actionTo: input.actionTo,
		sortDate: dueDate,
	};
}
