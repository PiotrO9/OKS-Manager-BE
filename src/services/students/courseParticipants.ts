import { CourseParticipantStatus, Prisma, Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import { assertActorCanListStudentsForSchool } from './access';
import type { PatchCourseParticipantStatusResult } from './types';

const prisma = getPrisma();

async function loadActiveStudentProfileId(
	studentUserId: string,
): Promise<string> {
	const studentUser = await prisma.user.findUnique({
		where: { id: studentUserId },
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
		throw AppError.badRequest('User is not a student');
	}

	return studentUser.studentProfile.id;
}

async function loadCourseSchoolId(courseId: string): Promise<string> {
	const course = await prisma.course.findFirst({
		where: { id: courseId, deletedAt: null },
		select: { id: true, schoolId: true },
	});

	if (!course) {
		throw AppError.notFound('Course not found');
	}

	return course.schoolId;
}

async function assertStudentBelongsToCourseSchool(
	studentUserId: string,
	schoolId: string,
): Promise<void> {
	const studentInSchool = await prisma.studentSchool.findFirst({
		where: {
			student: { userId: studentUserId },
			schoolId,
			school: { deletedAt: null },
		},
	});

	if (!studentInSchool) {
		throw AppError.forbidden('Forbidden');
	}
}

async function assertActorCanManageCourseParticipants(
	actorId: string,
	actorRole: Role,
	schoolId: string,
): Promise<void> {
	if (actorRole === Role.MANAGER || actorRole === Role.INSTRUCTOR) {
		await assertActorCanListStudentsForSchool(actorId, actorRole, schoolId);
		return;
	}

	throw AppError.forbidden('Forbidden');
}

export async function patchCourseParticipantStatusForStaff(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	courseId: string,
	status: CourseParticipantStatus,
): Promise<PatchCourseParticipantStatusResult> {
	if (actorRole === Role.ADMIN) {
		throw AppError.forbidden('Forbidden');
	}

	const studentProfileId = await loadActiveStudentProfileId(studentUserId);
	const schoolId = await loadCourseSchoolId(courseId);

	await assertStudentBelongsToCourseSchool(studentUserId, schoolId);
	await assertActorCanManageCourseParticipants(actorId, actorRole, schoolId);

	const existing = await prisma.courseParticipant.findFirst({
		where: { courseId, studentId: studentProfileId },
		select: { id: true },
	});

	if (!existing) {
		throw AppError.notFound('Student is not enrolled in this course');
	}

	return prisma.courseParticipant.update({
		where: {
			uq_course_participants_course_id_student_id: {
				courseId,
				studentId: studentProfileId,
			},
		},
		data: { status },
		select: {
			id: true,
			courseId: true,
			studentId: true,
			status: true,
		},
	});
}

export async function assignStudentToCourseForStaff(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	courseId: string,
) {
	if (actorRole === Role.ADMIN) {
		throw AppError.forbidden('Forbidden');
	}

	const studentProfileId = await loadActiveStudentProfileId(studentUserId);
	const schoolId = await loadCourseSchoolId(courseId);

	await assertStudentBelongsToCourseSchool(studentUserId, schoolId);
	await assertActorCanManageCourseParticipants(actorId, actorRole, schoolId);

	const existing = await prisma.courseParticipant.findFirst({
		where: { courseId, studentId: studentProfileId },
	});

	if (existing) {
		throw AppError.conflict('Student is already enrolled in this course');
	}

	try {
		return await prisma.courseParticipant.create({
			data: { courseId, studentId: studentProfileId },
		});
	} catch (err) {
		if (
			err instanceof Prisma.PrismaClientKnownRequestError &&
			err.code === 'P2002'
		) {
			throw AppError.conflict(
				'Student is already enrolled in this course',
			);
		}
		throw err;
	}
}
