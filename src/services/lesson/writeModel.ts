import { LessonType, Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { assertInstructorQualifiedForCourseType } from '../../lib/instructorCourseQualification';
import { validateVehicleForInstructor } from '../../lib/vehicle.helpers';
import type { UpdateLessonBody } from '../../schemas/lesson.schemas';
import {
	assertActorCanBookLessonForCourse,
	assertLessonTimeIsBookable,
} from './bookingRules';
import { mapLessonRowToDto, type LessonDto } from './dtoMappers';
import {
	assertLessonHasNotStarted,
	assertLessonIsEditable,
} from './editability';
import { assertLessonSchedulingWindowAvailable } from './scheduleConflicts';
import { vehicleHasBookingConflict } from './vehicleAvailability';
import { assertScheduleDurationAllowed } from '../schedule-validation/policy';
import { runScheduleWriteTransaction } from '../schedule-validation/transaction';

export { cancelLesson, cancelOwnLesson } from './cancelLessons';

export async function updateLesson(
	actor: { id: string; role: Role },
	lessonId: string,
	body: UpdateLessonBody,
): Promise<{ lesson: LessonDto }> {
	return runScheduleWriteTransaction(async (tx) => {
		const existing = await tx.lesson.findFirst({
			where: { id: lessonId, deletedAt: null },
			select: {
				id: true,
				status: true,
				courseId: true,
				studentId: true,
				instructorId: true,
				vehicleId: true,
				lessonType: true,
				startTime: true,
				endTime: true,
				createdAt: true,
				course: {
					select: {
						id: true,
						schoolId: true,
						courseTypeId: true,
						kind: true,
						totalHours: true,
					},
				},
			},
		});
		if (!existing) throw AppError.notFound('Lesson not found');
		await assertActorCanBookLessonForCourse(
			actor,
			existing.course.schoolId,
		);
		assertLessonIsEditable(existing.status, existing.endTime);

		const start =
			body.startTime !== undefined
				? new Date(body.startTime)
				: existing.startTime;
		const end =
			body.endTime !== undefined
				? new Date(body.endTime)
				: existing.endTime;
		const instructorId = body.instructorId ?? existing.instructorId;
		const vehicleId = body.vehicleId ?? existing.vehicleId;
		if (!vehicleId) throw AppError.badRequest('Lesson has no vehicle');
		const timeChanged =
			start.getTime() !== existing.startTime.getTime() ||
			end.getTime() !== existing.endTime.getTime();
		const vehicleChanged = vehicleId !== existing.vehicleId;
		const instructorChanged = instructorId !== existing.instructorId;
		if (instructorChanged && existing.lessonType !== LessonType.PRACTICE) {
			throw AppError.badRequest(
				'Only practice lessons can change instructor',
			);
		}
		const expected = body.expectedLessonState;
		if (body.instructorId !== undefined && !expected) {
			throw AppError.conflict(
				'Refresh the lesson before changing its instructor',
			);
		}
		if (
			expected &&
			(expected.instructorId !== existing.instructorId ||
				new Date(expected.startTime).getTime() !==
					existing.startTime.getTime() ||
				new Date(expected.endTime).getTime() !==
					existing.endTime.getTime() ||
				expected.vehicleId !== existing.vehicleId)
		) {
			throw AppError.conflict(
				'Lesson changed while editing. Refresh and try again',
			);
		}
		if (timeChanged || instructorChanged) {
			assertLessonHasNotStarted(existing.status, existing.startTime);
			assertLessonHasNotStarted(existing.status, start);
		}
		if (!timeChanged && !vehicleChanged && !instructorChanged) {
			return { lesson: mapLessonRowToDto(existing) };
		}

		const course = existing.course;
		const instructorLink = await tx.instructorSchool.findFirst({
			where: { instructorId, schoolId: course.schoolId },
			select: { id: true },
		});
		if (!instructorLink) {
			throw AppError.badRequest(
				'instructor does not belong to this driving school',
			);
		}
		if (instructorChanged) {
			await assertInstructorQualifiedForCourseType(
				instructorId,
				course.courseTypeId,
				tx,
			);
		}
		if (timeChanged) {
			await assertLessonTimeIsBookable(start, course.schoolId);
			await assertScheduleDurationAllowed(tx, {
				schoolId: course.schoolId,
				kind: 'PRACTICE',
				start,
				end,
			});
		}
		if (timeChanged || instructorChanged) {
			await assertLessonSchedulingWindowAvailable(tx, {
				instructorId,
				studentProfileId: existing.studentId,
				courseId: course.id,
				courseKind: course.kind,
				totalHours: course.totalHours,
				start,
				end,
				excludeLessonId: lessonId,
			});
		}
		const vehicleInSchool = await tx.vehicle.findFirst({
			where: { id: vehicleId, schoolId: course.schoolId, isActive: true },
			select: { id: true },
		});
		if (!vehicleInSchool)
			throw AppError.badRequest('Vehicle is not for this driving school');
		await validateVehicleForInstructor(instructorId, vehicleId, tx, {
			requireAvailable:
				timeChanged || vehicleChanged || instructorChanged,
		});
		if (
			await vehicleHasBookingConflict(tx, vehicleId, start, end, {
				excludeLessonId: lessonId,
			})
		) {
			throw AppError.conflict('Vehicle is already in use');
		}
		if (timeChanged || instructorChanged) {
			assertLessonHasNotStarted(existing.status, existing.startTime);
		}
		const row = await tx.lesson.update({
			where: { id: lessonId },
			data: { instructorId, vehicleId, startTime: start, endTime: end },
			select: {
				id: true,
				courseId: true,
				studentId: true,
				instructorId: true,
				vehicleId: true,
				lessonType: true,
				startTime: true,
				endTime: true,
				status: true,
				createdAt: true,
			},
		});
		return { lesson: mapLessonRowToDto(row) };
	});
}
