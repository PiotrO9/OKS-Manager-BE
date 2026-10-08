import { LessonType, type Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import type { LessonInstructorOptionsQuery } from '../../schemas/lesson.schemas';
import { listInstructorsBySchoolForUser } from '../instructor/queries';
import { checkScheduleAvailability } from '../schedule-validation/check';
import { assertActorCanBookLessonForCourse } from './bookingRules';
import { assertLessonHasNotStarted } from './editability';

const prisma = getPrisma();

export async function getLessonInstructorOptions(
	actor: { id: string; role: Role },
	lessonId: string,
	query: LessonInstructorOptionsQuery,
) {
	const lesson = await prisma.lesson.findFirst({
		where: { id: lessonId, deletedAt: null },
		select: {
			id: true,
			status: true,
			startTime: true,
			lessonType: true,
			instructorId: true,
			course: { select: { schoolId: true, courseTypeId: true } },
		},
	});
	if (!lesson) throw AppError.notFound('Lesson not found');
	await assertActorCanBookLessonForCourse(actor, lesson.course.schoolId);
	if (lesson.lessonType !== LessonType.PRACTICE) {
		throw AppError.badRequest(
			'Only practice lessons can change instructor',
		);
	}
	assertLessonHasNotStarted(lesson.status, lesson.startTime);
	const { instructors } = await listInstructorsBySchoolForUser(
		actor,
		lesson.course.schoolId,
	);
	const qualified = instructors.filter(
		(instructor) =>
			instructor.id !== lesson.instructorId &&
			instructor.qualifiedCourseTypes.some(
				(type) => type.id === lesson.course.courseTypeId,
			),
	);
	const available: typeof qualified = [];
	// Bound DB work for schools with many instructors.
	for (let offset = 0; offset < qualified.length; offset += 4) {
		const batch = qualified.slice(offset, offset + 4);
		const results = await Promise.all(
			batch.map(async (instructor) => {
				const result = await checkScheduleAvailability(actor, {
					intent: 'lesson_edit',
					lessonId,
					instructorId: instructor.id,
					vehicleId: query.vehicleId,
					date: query.date,
					startTime: query.startTime,
					endTime: query.endTime,
				});
				return result.available ? instructor : null;
			}),
		);
		available.push(
			...results.filter(
				(item): item is (typeof qualified)[number] => item !== null,
			),
		);
	}
	return { instructors: available };
}
