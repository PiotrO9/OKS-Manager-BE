import { CourseKind, LessonStatus, Prisma } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import {
	assertCourseDrivingPackageHoursAllowNewLesson,
	assertStudentNoScheduleOverlap,
} from '../../lib/lesson-scheduling';
import { assertInstructorTimeWindowAvailable } from '../instructor-availability.service';

type TransactionClient = Prisma.TransactionClient;

export async function assertLessonSchedulingWindowAvailable(
	tx: TransactionClient,
	params: {
		instructorId: string;
		studentProfileId: string;
		courseId: string;
		courseKind: CourseKind;
		totalHours: number;
		start: Date;
		end: Date;
		excludeLessonId?: string;
	},
): Promise<void> {
	await assertInstructorTimeWindowAvailable(
		params.instructorId,
		params.start,
		params.end,
		tx,
		undefined,
		params.excludeLessonId,
	);

	await assertStudentNoScheduleOverlap(
		tx,
		params.studentProfileId,
		params.start,
		params.end,
		params.excludeLessonId
			? { excludeLessonId: params.excludeLessonId }
			: undefined,
	);

	await assertCourseDrivingPackageHoursAllowNewLesson(
		tx,
		params.courseId,
		params.studentProfileId,
		params.courseKind,
		params.totalHours,
		params.start,
		params.end,
		params.excludeLessonId,
	);

	const lessonConflict = await tx.lesson.findFirst({
		where: {
			instructorId: params.instructorId,
			status: { not: LessonStatus.CANCELLED },
			startTime: { lt: params.end },
			endTime: { gt: params.start },
			...(params.excludeLessonId
				? { id: { not: params.excludeLessonId } }
				: {}),
		},
		select: { id: true },
	});
	if (lessonConflict) {
		throw AppError.conflict('Time slot conflicts with a lesson');
	}

	const eventConflict = await tx.instructorEvent.findFirst({
		where: {
			instructorId: params.instructorId,
			isActive: true,
			startTime: { lt: params.end },
			endTime: { gt: params.start },
		},
		select: { id: true },
	});
	if (eventConflict) {
		throw AppError.conflict('Time slot conflicts with a scheduled block');
	}
}
