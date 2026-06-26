import {
	CourseKind,
	CourseParticipantStatus,
	Role,
} from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { assertInstructorQualifiedForCourseType } from '../../lib/instructorCourseQualification';
import { getPrisma } from '../../lib/prisma';

const prisma = getPrisma();

export type CourseForBooking = {
	id: string;
	schoolId: string;
	instructorId: string | null;
	courseTypeId: string;
	kind: CourseKind;
	totalHours: number;
};

export async function assertActorCanBookLessonForCourse(
	actor: { id: string; role: Role },
	schoolId: string,
): Promise<void> {
	if (actor.role === Role.ADMIN) {
		return;
	}
	if (actor.role === Role.MANAGER) {
		const school = await prisma.drivingSchool.findFirst({
			where: { id: schoolId, ownerId: actor.id, deletedAt: null },
			select: { id: true },
		});
		if (!school) {
			throw AppError.forbidden('Forbidden');
		}
		return;
	}
	throw AppError.forbidden('Forbidden');
}

export function assertCourseCanBeSelfBooked(course: CourseForBooking): void {
	if (course.kind === CourseKind.THEORY_GROUP) {
		throw AppError.badRequest('Course does not allow practice lessons');
	}
}

export async function loadCourseForBooking(
	courseId: string,
): Promise<CourseForBooking> {
	const course = await prisma.course.findFirst({
		where: { id: courseId, deletedAt: null },
		select: {
			id: true,
			schoolId: true,
			instructorId: true,
			courseTypeId: true,
			kind: true,
			totalHours: true,
		},
	});

	if (!course) {
		throw AppError.notFound('Course not found');
	}

	return course;
}

export async function loadStudentProfileIdForUser(
	userId: string,
): Promise<string> {
	const studentUser = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			id: true,
			role: true,
			deletedAt: true,
			isActive: true,
			studentProfile: { select: { id: true } },
		},
	});

	if (!studentUser || studentUser.deletedAt !== null) {
		throw AppError.notFound('User not found');
	}

	if (!studentUser.isActive) {
		throw AppError.forbidden('Account is disabled');
	}

	if (studentUser.role !== Role.STUDENT || !studentUser.studentProfile) {
		throw AppError.badRequest('studentId must be a student user');
	}

	return studentUser.studentProfile.id;
}

export async function assertInstructorCanBookCourse(
	instructorId: string,
	course: CourseForBooking,
): Promise<void> {
	const instructorLink = await prisma.instructorSchool.findFirst({
		where: {
			instructorId,
			schoolId: course.schoolId,
		},
		select: { id: true },
	});

	if (!instructorLink) {
		throw AppError.badRequest(
			'instructor does not belong to this driving school',
		);
	}

	if (course.instructorId != null && course.instructorId !== instructorId) {
		throw AppError.badRequest(
			'instructor does not match course assigned instructor',
		);
	}

	await assertInstructorQualifiedForCourseType(
		instructorId,
		course.courseTypeId,
	);
}

export async function assertStudentParticipatesInCourse(
	courseId: string,
	studentProfileId: string,
	options?: { requireActive?: boolean },
): Promise<void> {
	const participant = await prisma.courseParticipant.findFirst({
		where: {
			courseId,
			studentId: studentProfileId,
			...(options?.requireActive
				? { status: CourseParticipantStatus.ACTIVE }
				: {}),
		},
		select: { id: true },
	});

	if (!participant) {
		throw options?.requireActive
			? AppError.forbidden('Forbidden')
			: AppError.notFound('Student is not enrolled in this course');
	}
}
