import type { EventStatus, EventType, LessonType, Role } from '@prisma/client';

export type ScheduleActor = { id: string; role: Role };

export type ScheduleLessonItemDto = {
	kind: 'lesson';
	id: string;
	type: LessonType;
	status: string;
	startTime: string;
	endTime: string;
	instructor?: { id: string; firstName: string; lastName: string };
	student?: { id: string; firstName: string; lastName: string };
	vehicle?: { id: string; name: string; registrationNumber: string };
	rating?: {
		id: string;
		rating: number;
		comment: string | null;
		createdAt: string;
	} | null;
};

export type ScheduleInstructorEventItemDto = {
	kind: 'instructor_event';
	id: string;
	eventType: EventType;
	type: LessonType;
	status: EventStatus;
	startTime: string;
	endTime: string;
	capacity: number | null;
	participantCount: number;
	instructor?: { id: string; firstName: string; lastName: string };
	students?: { id: string; firstName: string; lastName: string }[];
	vehicle?: { id: string; name: string; registrationNumber: string };
};

export type ScheduleItemDto =
	| ScheduleLessonItemDto
	| ScheduleInstructorEventItemDto;

export type LessonRow = {
	id: string;
	lessonType: LessonType;
	status: string;
	startTime: Date;
	endTime: Date;
	instructorProfile: {
		id: string;
		user: { firstName: string; lastName: string };
	};
	studentProfile: {
		id: string;
		user: { firstName: string; lastName: string };
	};
	vehicle: {
		id: string;
		name: string;
		registrationNumber: string;
	} | null;
	lessonRating: {
		id: string;
		rating: number;
		comment: string | null;
		createdAt: Date;
	} | null;
};

export type EventRow = {
	id: string;
	type: EventType;
	status: EventStatus;
	startTime: Date;
	endTime: Date;
	capacity: number | null;
	instructor: {
		id: string;
		user: { firstName: string; lastName: string };
	};
	vehicle: {
		id: string;
		name: string;
		registrationNumber: string;
	} | null;
	participants: {
		student: {
			id: string;
			user: { firstName: string; lastName: string };
		};
	}[];
};
