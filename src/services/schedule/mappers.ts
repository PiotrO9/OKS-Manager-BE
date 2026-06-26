import { EventType, LessonType } from '@prisma/client';
import type {
	EventRow,
	LessonRow,
	ScheduleInstructorEventItemDto,
	ScheduleItemDto,
	ScheduleLessonItemDto,
} from './types';

function compareScheduleByStart(a: ScheduleItemDto, b: ScheduleItemDto) {
	const t1 = new Date(a.startTime).getTime();
	const t2 = new Date(b.startTime).getTime();
	return t1 - t2;
}

export function mergeScheduleItems(
	lessonItems: ScheduleLessonItemDto[],
	eventItems: ScheduleInstructorEventItemDto[],
): ScheduleItemDto[] {
	return [...lessonItems, ...eventItems].sort(compareScheduleByStart);
}

export function mapLesson(
	row: LessonRow,
	opts: {
		includeInstructor: boolean;
		includeStudent: boolean;
		includeRating?: boolean;
	},
): ScheduleLessonItemDto {
	const item: ScheduleLessonItemDto = {
		kind: 'lesson',
		id: row.id,
		type: row.lessonType,
		status: row.status,
		startTime: row.startTime.toISOString(),
		endTime: row.endTime.toISOString(),
	};
	if (opts.includeInstructor) {
		item.instructor = {
			id: row.instructorProfile.id,
			firstName: row.instructorProfile.user.firstName,
			lastName: row.instructorProfile.user.lastName,
		};
	}
	if (opts.includeStudent) {
		item.student = {
			id: row.studentProfile.id,
			firstName: row.studentProfile.user.firstName,
			lastName: row.studentProfile.user.lastName,
		};
	}
	if (row.vehicle) {
		item.vehicle = {
			id: row.vehicle.id,
			name: row.vehicle.name,
			registrationNumber: row.vehicle.registrationNumber,
		};
	}
	if (opts.includeRating) {
		item.rating = row.lessonRating
			? {
				id: row.lessonRating.id,
				rating: row.lessonRating.rating,
				comment: row.lessonRating.comment,
				createdAt: row.lessonRating.createdAt.toISOString(),
			}
			: null;
	}
	return item;
}

function eventTypeToCalendarLessonType(et: EventType): LessonType {
	return et === EventType.THEORY ? LessonType.THEORY : LessonType.PRACTICE;
}

function sortParticipantsForSchedule(
	participants: EventRow['participants'],
): { id: string; firstName: string; lastName: string }[] {
	const mapped = participants.map((p) => ({
		id: p.student.id,
		firstName: p.student.user.firstName,
		lastName: p.student.user.lastName,
	}));
	return mapped.sort((a, b) => {
		const ln = a.lastName.localeCompare(b.lastName);
		if (ln !== 0) return ln;
		return a.firstName.localeCompare(b.firstName);
	});
}

export function mapInstructorEvent(
	row: EventRow,
	opts: { includeInstructor: boolean; includeStudents: boolean },
): ScheduleInstructorEventItemDto {
	const item: ScheduleInstructorEventItemDto = {
		kind: 'instructor_event',
		id: row.id,
		eventType: row.type,
		type: eventTypeToCalendarLessonType(row.type),
		status: row.status,
		startTime: row.startTime.toISOString(),
		endTime: row.endTime.toISOString(),
		capacity: row.capacity,
		participantCount: row.participants.length,
	};
	const includeInstructorEffective =
		opts.includeInstructor || row.type === EventType.THEORY;
	if (includeInstructorEffective) {
		item.instructor = {
			id: row.instructor.id,
			firstName: row.instructor.user.firstName,
			lastName: row.instructor.user.lastName,
		};
	}
	if (opts.includeStudents) {
		item.students = sortParticipantsForSchedule(row.participants);
	}
	if (row.vehicle) {
		item.vehicle = {
			id: row.vehicle.id,
			name: row.vehicle.name,
			registrationNumber: row.vehicle.registrationNumber,
		};
	}
	return item;
}
