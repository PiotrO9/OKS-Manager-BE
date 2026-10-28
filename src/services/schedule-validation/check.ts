import { Role } from '@prisma/client';
import type { ScheduleAvailabilityCheckBody } from '../../schemas/schedule.schemas';
import type { ScheduleAvailabilityIssue } from './checkTypes';
import { checkLessonCreateAvailability } from './lessonCreateCheck';
import { checkLessonSelfBookAvailability } from './lessonSelfBookCheck';
import { checkLessonEditAvailability } from './lessonEditCheck';
import {
	checkEventCreateAvailability,
	checkEventEditAvailability,
} from './eventChecks';
export type {
	ScheduleAvailabilityIssueCode,
	ScheduleAvailabilityIssue,
} from './checkTypes';

export async function checkScheduleAvailability(
	actor: { id: string; role: Role },
	body: ScheduleAvailabilityCheckBody,
): Promise<{
	available: boolean;
	issues: ScheduleAvailabilityIssue[];
	policy: { minDurationMinutes: number; maxDurationMinutes: number };
	remainingMinutes?: number;
	alternative?: {
		startTime: string;
		endTime: string;
		durationMinutes: number;
	};
}> {
	if (body.intent === 'lesson_create') {
		return checkLessonCreateAvailability(actor, body);
	}

	if (body.intent === 'lesson_self_book') {
		return checkLessonSelfBookAvailability(actor, body);
	}

	if (body.intent === 'lesson_edit') {
		return checkLessonEditAvailability(actor, body);
	}

	if (body.intent === 'event_edit') {
		return checkEventEditAvailability(actor, body);
	}

	return checkEventCreateAvailability(actor, body);
}
