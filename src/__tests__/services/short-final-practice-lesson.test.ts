import { describe, expect, it, vi } from 'vitest';
import { assertCourseDrivingPackageHoursAllowNewLesson } from '../../lib/lesson-scheduling';
import { assertStudentSelfBookingDurationAllowed } from '../../services/schedule-validation/policy';
import { CourseKind } from '@prisma/client';

const start = new Date('2026-10-19T06:00:00.000Z');
const end30 = new Date('2026-10-19T06:30:00.000Z');
const end60 = new Date('2026-10-19T07:00:00.000Z');

function dbWithBookedMinutes(
	bookedMinutes: number,
	allowShortFinalPracticeLesson = true,
) {
	return {
		lesson: {
			findMany: vi.fn().mockResolvedValue([
				{
					startTime: start,
					endTime: new Date(start.getTime() + bookedMinutes * 60_000),
				},
			]),
		},
		schoolSettings: {
			findUnique: vi.fn().mockResolvedValue({
				practiceMinDurationMinutes: 60,
				practiceMaxDurationMinutes: 120,
				allowShortFinalPracticeLesson,
				minFinalPracticeDurationMinutes: 30,
			}),
		},
	};
}

const input = {
	schoolId: 'school',
	courseId: 'course',
	studentProfileId: 'student',
	totalHours: 2,
	start,
	end: end30,
	bookingMode: 'REMAINING_PACKAGE' as const,
};

describe('last partial practical lesson', () => {
	it('offers only the exact 30-minute balance, counting noncancelled active practice lessons', async () => {
		const db = dbWithBookedMinutes(90);
		await expect(
			assertStudentSelfBookingDurationAllowed(db as never, input),
		).resolves.toBeUndefined();
		expect(db.lesson.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					deletedAt: null,
					lessonType: 'PRACTICE',
					status: { not: 'CANCELLED' },
				}),
			}),
		);
		await expect(
			assertCourseDrivingPackageHoursAllowNewLesson(
				db as never,
				'course',
				'student',
				CourseKind.PRACTICAL,
				2,
				start,
				end60,
			),
		).rejects.toMatchObject({
			reason: 'COURSE_LIMIT_EXCEEDED',
			details: { remainingMinutes: 30 },
		});
	});

	it('rejects 15 minutes and a short booking disabled by school settings', async () => {
		await expect(
			assertStudentSelfBookingDurationAllowed(
				dbWithBookedMinutes(105) as never,
				{ ...input, end: new Date(start.getTime() + 15 * 60_000) },
			),
		).rejects.toMatchObject({ statusCode: 400 });
		await expect(
			assertStudentSelfBookingDurationAllowed(
				dbWithBookedMinutes(90, false) as never,
				input,
			),
		).rejects.toMatchObject({ statusCode: 400 });
	});

	it('rejects a stale proposal if the remaining balance changes before write', async () => {
		await expect(
			assertStudentSelfBookingDurationAllowed(
				dbWithBookedMinutes(100) as never,
				input,
			),
		).rejects.toMatchObject({
			statusCode: 409,
			reason: 'COURSE_LIMIT_EXCEEDED',
			details: { remainingMinutes: 20 },
		});
	});
});
