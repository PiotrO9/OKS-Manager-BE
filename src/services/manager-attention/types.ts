export type ManagerAttentionItemPriority = 'urgent' | 'todo' | 'info';

export type ManagerAttentionItemType =
	| 'student_missing_pkk'
	| 'student_missing_course'
	| 'student_missing_first_lesson'
	| 'payment_overdue'
	| 'payment_due_soon'
	| 'vehicle_document_expired'
	| 'vehicle_document_expiring'
	| 'instructor_missing_availability'
	| 'low_lesson_rating';

export type ManagerAttentionItemDto = {
	id: string;
	type: ManagerAttentionItemType;
	priority: ManagerAttentionItemPriority;
	title: string;
	description: string;
	entityId: string;
	entityLabel: string;
	dueDate: string | null;
	actionTo: string;
};

export type ManagerAttentionResultDto = {
	items: ManagerAttentionItemDto[];
	total: number;
	hiddenCount: number;
};
