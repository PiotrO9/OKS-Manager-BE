import type { Prisma } from '@prisma/client';
import type { InstructorQualifiedCourseType } from './types';

export const qualifiedCourseTypesSelect = {
	id: true,
	code: true,
	name: true,
} satisfies Prisma.CourseTypeSelect;

export function mapQualifiedCourseTypes(
	rows: InstructorQualifiedCourseType[],
): InstructorQualifiedCourseType[] {
	return rows
		.map((row) => ({ id: row.id, code: row.code, name: row.name }))
		.sort((a, b) => a.code.localeCompare(b.code));
}
