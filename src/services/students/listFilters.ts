import { Prisma } from '@prisma/client';
import type {
	ListStudentsQuery,
	StudentAdvancedFilter,
} from '../../lib/validation/uuid';

function buildInsensitiveContains(value: string): Prisma.StringFilter {
	return { contains: value, mode: 'insensitive' };
}

function buildInsensitiveEquals(value: string): Prisma.StringFilter {
	return { equals: value, mode: 'insensitive' };
}

function buildUserTextFilter(
	field: 'firstName' | 'lastName' | 'email',
	operator: 'contains' | 'not_contains' | 'eq' | 'neq',
	value: string,
): Prisma.StudentProfileWhereInput {
	if (operator === 'contains') {
		return { user: { [field]: buildInsensitiveContains(value) } };
	}

	if (operator === 'eq') {
		return { user: { [field]: buildInsensitiveEquals(value) } };
	}

	if (operator === 'not_contains') {
		return {
			NOT: { user: { [field]: buildInsensitiveContains(value) } },
		};
	}

	return {
		NOT: { user: { [field]: buildInsensitiveEquals(value) } },
	};
}

function buildNullableUserTextFilter(
	field: 'phone',
	operator: 'contains' | 'not_contains' | 'is_empty' | 'is_not_empty',
	value?: string,
): Prisma.StudentProfileWhereInput {
	switch (operator) {
		case 'is_empty':
			return { user: { OR: [{ [field]: null }, { [field]: '' }] } };

		case 'is_not_empty':
			return {
				user: {
					AND: [{ [field]: { not: null } }, { [field]: { not: '' } }],
				},
			};

		case 'contains':
			return { user: { [field]: buildInsensitiveContains(value ?? '') } };

		case 'not_contains':
			return {
				OR: [
					{ user: { [field]: null } },
					{
						NOT: {
							user: {
								[field]: buildInsensitiveContains(value ?? ''),
							},
						},
					},
				],
			};
	}
}

function buildNullableStudentTextFilter(
	field: 'pkkNumber',
	operator:
		| 'contains'
		| 'not_contains'
		| 'eq'
		| 'neq'
		| 'is_empty'
		| 'is_not_empty',
	value?: string,
): Prisma.StudentProfileWhereInput {
	if (operator === 'is_empty') {
		return { OR: [{ [field]: null }, { [field]: '' }] };
	}

	if (operator === 'is_not_empty') {
		return { AND: [{ [field]: { not: null } }, { [field]: { not: '' } }] };
	}

	if (operator === 'contains') {
		return { [field]: buildInsensitiveContains(value ?? '') };
	}

	if (operator === 'eq') {
		return { [field]: buildInsensitiveEquals(value ?? '') };
	}

	if (operator === 'not_contains') {
		return {
			OR: [
				{ [field]: null },
				{ NOT: { [field]: buildInsensitiveContains(value ?? '') } },
			],
		};
	}

	return {
		OR: [
			{ [field]: null },
			{ NOT: { [field]: buildInsensitiveEquals(value ?? '') } },
		],
	};
}

function buildCourseFilter(
	schoolId: string,
	filter: Extract<StudentAdvancedFilter, { field: 'courseId' }>,
): Prisma.StudentProfileWhereInput {
	const scopedCourse = { schoolId, deletedAt: null };

	if (filter.operator === 'is_empty') {
		return { courseParticipants: { none: { course: scopedCourse } } };
	}

	if (filter.operator === 'is_not_empty') {
		return { courseParticipants: { some: { course: scopedCourse } } };
	}

	if (filter.operator === 'eq') {
		return {
			courseParticipants: {
				some: { courseId: filter.value, course: scopedCourse },
			},
		};
	}

	if (filter.operator === 'neq') {
		return {
			courseParticipants: {
				none: { courseId: filter.value, course: scopedCourse },
			},
		};
	}

	return {
		courseParticipants: {
			none: { course: scopedCourse },
		},
	};
}

function buildOverduePaymentsFilter(
	schoolId: string,
	now: Date,
	hasOverduePayments: boolean,
): Prisma.StudentProfileWhereInput {
	const today = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
	);
	const overduePredicate = {
		course: {
			schoolId,
			deletedAt: null,
			paymentPlans: {
				some: {
					payments: {
						some: {
							status: { not: 'PAID' as const },
							dueDate: { lt: today },
						},
					},
				},
			},
		},
	};

	return {
		courseParticipants: hasOverduePayments
			? { some: overduePredicate }
			: { none: overduePredicate },
	};
}

function buildUpcomingLessonFilter(
	schoolId: string,
	now: Date,
	hasUpcomingLesson: boolean,
): Prisma.StudentProfileWhereInput {
	const lessonPredicate = {
		course: { schoolId, deletedAt: null },
		deletedAt: null,
		lessonType: 'PRACTICE' as const,
		status: 'SCHEDULED' as const,
		startTime: { gte: now },
	};

	return {
		lessons: hasUpcomingLesson
			? { some: lessonPredicate }
			: { none: lessonPredicate },
	};
}

function startOfUtcDate(date: string): Date {
	return new Date(`${date}T00:00:00.000Z`);
}

function startOfNextUtcDate(date: string): Date {
	const result = startOfUtcDate(date);
	result.setUTCDate(result.getUTCDate() + 1);

	return result;
}

function buildCreatedAtFilter(
	filter: Extract<StudentAdvancedFilter, { field: 'createdAt' }>,
): Prisma.StudentProfileWhereInput {
	if (filter.operator === 'before') {
		return { createdAt: { lt: startOfUtcDate(filter.value) } };
	}

	if (filter.operator === 'after') {
		return { createdAt: { gte: startOfNextUtcDate(filter.value) } };
	}

	return {
		createdAt: {
			gte: startOfUtcDate(filter.value[0]),
			lt: startOfNextUtcDate(filter.value[1]),
		},
	};
}

function buildAdvancedFilterWhere(
	schoolId: string,
	filter: StudentAdvancedFilter,
	now: Date,
): Prisma.StudentProfileWhereInput {
	switch (filter.field) {
		case 'firstName':
		case 'lastName':
		case 'email':
			return buildUserTextFilter(
				filter.field,
				filter.operator,
				filter.value,
			);
		case 'phone':
			return buildNullableUserTextFilter(
				filter.field,
				filter.operator,
				'value' in filter ? filter.value : undefined,
			);
		case 'pkkNumber':
			return buildNullableStudentTextFilter(
				filter.field,
				filter.operator,
				'value' in filter ? filter.value : undefined,
			);
		case 'isActive':
			return {
				user: {
					isActive:
						filter.operator === 'eq' ? filter.value : !filter.value,
				},
			};
		case 'courseId':
			return buildCourseFilter(schoolId, filter);
		case 'hasOverduePayments':
			return buildOverduePaymentsFilter(schoolId, now, filter.value);
		case 'hasUpcomingLesson':
			return buildUpcomingLessonFilter(schoolId, now, filter.value);
		case 'createdAt':
			return buildCreatedAtFilter(filter);
	}
}

/** All predicates are applied before counting and pagination, within the selected school. */
export function buildStudentListWhere(
	query: ListStudentsQuery,
	now = new Date(),
): Prisma.StudentProfileWhereInput {
	const { schoolId, courseId, search, view, filters = [] } = query;
	const AND: Prisma.StudentProfileWhereInput[] = [];
	if (courseId) AND.push({ courseParticipants: { some: { courseId } } });
	for (const term of search?.trim().split(/\s+/).filter(Boolean) ?? []) {
		const contains = { contains: term, mode: 'insensitive' as const };
		AND.push({
			OR: [
				{ user: { firstName: contains } },
				{ user: { lastName: contains } },
				{ user: { email: contains } },
				{ user: { phone: contains } },
				{ pkkNumber: contains },
			],
		});
	}
	if (view === 'without-pkk')
		AND.push({ OR: [{ pkkNumber: null }, { pkkNumber: '' }] });
	if (view === 'without-course')
		AND.push({
			courseParticipants: {
				none: { course: { schoolId, deletedAt: null } },
			},
		});
	if (view === 'without-lesson')
		AND.push({
			lessons: {
				none: {
					course: { schoolId, deletedAt: null },
					deletedAt: null,
					lessonType: 'PRACTICE',
					status: 'SCHEDULED',
					startTime: { gte: now },
				},
			},
		});
	if (view === 'overdue') {
		AND.push(buildOverduePaymentsFilter(schoolId, now, true));
	}

	for (const filter of filters) {
		AND.push(buildAdvancedFilterWhere(schoolId, filter, now));
	}

	return {
		user: { deletedAt: null },
		studentSchools: { some: { schoolId, school: { deletedAt: null } } },
		AND,
	};
}
