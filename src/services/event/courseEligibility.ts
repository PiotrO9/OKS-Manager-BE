import { AppError } from '../../lib/http/AppError';
import { assertInstructorQualifiedForCourseType } from '../../lib/instructorCourseQualification';
import { getPrisma } from '../../lib/prisma';

const prisma = getPrisma();

export async function assertCourseEligibleForInstructorEvent(
	instructorId: string,
	courseId: string,
): Promise<void> {
	const course = await prisma.course.findFirst({
		where: { id: courseId, deletedAt: null },
		select: { id: true, schoolId: true, courseTypeId: true },
	});
	if (!course) {
		throw AppError.notFound('Course not found');
	}
	const link = await prisma.instructorSchool.findFirst({
		where: { instructorId, schoolId: course.schoolId },
		select: { id: true },
	});
	if (!link) {
		throw AppError.unprocessableEntity(
			'Instructor is not linked to the driving school of this course',
		);
	}
	await assertInstructorQualifiedForCourseType(
		instructorId,
		course.courseTypeId,
	);
}
