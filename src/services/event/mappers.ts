import { EventStatus, EventType, LessonType } from '@prisma/client';
import {
	type LessonPersonDetailDto,
	type LessonVehicleDetailDto,
} from '../lesson.service';

export type InstructorEventDto = {
	id: string;
	instructorId: string;
	type: EventType;
	status: EventStatus;
	courseId: string | null;
	startTime: string;
	endTime: string;
	vehicleId: string | null;
	capacity: number | null;
	createdAt: string;
};

/** GET `/students/:userId/events` — jak `InstructorEventDto`, ale zagnieżdżone **`instructor`** / **`vehicle`** (jak GET `/lessons/:id`), **`course`**, **`participantCount`**, **`calendarLessonType`** (THEORY / PRACTICE dla jednego kodu kalendarza). */
export type StudentInstructorEventListItemDto = Omit<
	InstructorEventDto,
	'instructorId' | 'vehicleId'
> & {
	instructor: LessonPersonDetailDto;
	vehicle: LessonVehicleDetailDto | null;
	participantCount: number;
	calendarLessonType: LessonType;
	course: { id: string; name: string } | null;
};

/** GET `/events/:id` — bez płaskich `instructorId` / `vehicleId`; pełny **`instructor`** jak przy GET `/lessons/:id`; **`students`** — uczestnicy z `event_participants`, ten sam kształt co osoba przy GET `/lessons/:id`, kolejność wg `created_at` (THEORY: wiele, DRIVE: zwykle 0–1). Opcjonalnie **`freeWindows`** gdy `?includeSlots=true`. */
export type InstructorEventWithDetailsDto = Omit<
	InstructorEventDto,
	'instructorId' | 'vehicleId'
> & {
	instructor: LessonPersonDetailDto;
	students: LessonPersonDetailDto[];
	freeWindows?: { startTime: string; endTime: string }[];
};

/** GET `/events` — płaskie podsumowanie + liczba uczestników. */
export type InstructorEventListItemDto = {
	id: string;
	type: EventType;
	status: EventStatus;
	instructorId: string;
	courseId: string | null;
	startTime: string;
	endTime: string;
	vehicleId: string | null;
	capacity: number | null;
	participantCount: number;
	createdAt: string;
};

export type AssignStudentsToEventResult = {
	assigned: number;
	skipped: number;
};

export type ReplaceEventStudentsResult = { studentUserIds: string[] };

export type TheoryEventEligibleCapacityDto = {
	limit: number | null;
	used: number;
	remaining: number | null;
};

export type TheoryEventEligibleStudentRowDto = {
	id: string;
	userId: string;
	firstName: string;
	lastName: string;
	email: string;
	phone: string | null;
	pkkNumber: string | null;
	isActive: boolean;
	createdAt: string;
	isAssignedToEvent: boolean;
	hasScheduleConflict: boolean;
	canAssign: boolean;
};

export type ListTheoryEventEligibleStudentsResult = {
	courseId: string;
	capacity: TheoryEventEligibleCapacityDto;
	students: TheoryEventEligibleStudentRowDto[];
};
