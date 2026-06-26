import type { Role } from '@prisma/client';

export type Actor = { id: string; role: Role };

export type SchoolSlotItemDto = {
	instructorId: string;
	instructorFirstName: string;
	instructorLastName: string;
	date: string;
	startTime: string;
	endTime: string;
};

export type ListSchoolSlotsResult = {
	slots: SchoolSlotItemDto[];
	total: number;
};

export type SchoolSlotAccess = {
	id: string;
	slotDurationMinutes: number;
	bookingMaxDaysAhead: number;
};

export type InstructorMeta = {
	firstName: string;
	lastName: string;
};

export type BusyInterval = {
	date: string;
	startMin: number;
	endMin: number;
};
