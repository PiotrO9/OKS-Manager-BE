import type { CourseType } from '@prisma/client';
import type { CourseTypeDto, CourseWithType, CreatedCourseDto } from './types';

export function toCourseTypeDto(
	row: Pick<CourseType, 'id' | 'code' | 'name'>,
): CourseTypeDto {
	return {
		id: row.id,
		code: row.code,
		name: row.name,
	};
}

export function toDto(row: CourseWithType): CreatedCourseDto {
	return {
		id: row.id,
		name: row.name,
		category: row.category,
		courseType: toCourseTypeDto(row.courseType),
		kind: row.kind,
		totalHours: row.totalHours,
		capacity: row.capacity,
		theoryStartDate: row.theoryStartDate,
		theoryEndDate: row.theoryEndDate,
		schoolId: row.schoolId,
		instructorId: row.instructorId,
		status: row.status,
		createdAt: row.createdAt,
	};
}
