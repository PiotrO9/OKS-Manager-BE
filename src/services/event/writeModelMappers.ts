import type { InstructorEventDto } from './mappers';

export const instructorEventWriteSelect = {
	id: true,
	instructorId: true,
	courseId: true,
	type: true,
	status: true,
	startTime: true,
	endTime: true,
	vehicleId: true,
	capacity: true,
	createdAt: true,
} as const;

type InstructorEventWriteRow = {
	id: string;
	instructorId: string;
	courseId: string | null;
	type: InstructorEventDto['type'];
	status: InstructorEventDto['status'];
	startTime: Date;
	endTime: Date;
	vehicleId: string | null;
	capacity: number | null;
	createdAt: Date;
};

export function mapInstructorEventWriteDto(
	row: InstructorEventWriteRow,
): InstructorEventDto {
	return {
		id: row.id,
		instructorId: row.instructorId,
		type: row.type,
		status: row.status,
		courseId: row.courseId,
		startTime: row.startTime.toISOString(),
		endTime: row.endTime.toISOString(),
		vehicleId: row.vehicleId,
		capacity: row.capacity,
		createdAt: row.createdAt.toISOString(),
	};
}
