import { CourseParticipantStatus, Prisma, Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import {
	assertActorCanAssignStudentToSchoolForAdminOrManager,
	attachStudentToSchoolReplaceInTx,
} from '../../lib/studentSchoolRegistration';
import {
	assertActorCanListStudentsForSchool,
	assertActorCanPatchStudentPkk,
} from './access';
import type {
	AssignStudentDrivingSchoolResult,
	PatchCourseParticipantStatusResult,
	PatchStudentPkkResult,
	PatchStudentResult,
} from './types';

const prisma = getPrisma();

export async function assignStudentDrivingSchoolForAdminOrManager(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	schoolId: string,
): Promise<AssignStudentDrivingSchoolResult> {
	if (actorRole !== Role.ADMIN && actorRole !== Role.MANAGER) {
		throw AppError.forbidden('Forbidden');
	}

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

	await assertActorCanAssignStudentToSchoolForAdminOrManager(
		prisma,
		actorRole,
		actorId,
		schoolId,
	);

	await prisma.$transaction(async (tx) => {
		await attachStudentToSchoolReplaceInTx(tx, studentUserId, schoolId);
	});

	const drivingSchool = await prisma.drivingSchool.findUnique({
		where: { id: schoolId },
		select: {
			id: true,
			name: true,
			city: true,
			address: true,
		},
	});
	if (!drivingSchool) {
		throw AppError.notFound('Driving school not found');
	}

	return {
		userId: studentUserId,
		drivingSchool,
	};
}

export async function patchStudentPkkForStaff(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	pkkNumber: string | null,
): Promise<PatchStudentPkkResult> {
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

	await assertActorCanPatchStudentPkk(actorId, actorRole, studentUserId);

	try {
		await prisma.studentProfile.update({
			where: { userId: studentUserId },
			data: { pkkNumber },
		});
	} catch (err) {
		if (
			err instanceof Prisma.PrismaClientKnownRequestError &&
			err.code === 'P2002'
		) {
			throw AppError.conflict('PKK number already in use');
		}
		throw err;
	}

	return { userId: studentUserId, pkkNumber };
}

export async function patchStudentForStaff(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	data: { notes: string | null },
): Promise<PatchStudentResult> {
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

	await assertActorCanPatchStudentPkk(actorId, actorRole, studentUserId);

	const updated = await prisma.studentProfile.update({
		where: { userId: studentUserId },
		data: { notes: data.notes },
		select: { notes: true },
	});

	return { userId: studentUserId, notes: updated.notes };
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

	const studentProfileId = studentUser.studentProfile.id;

	const course = await prisma.course.findFirst({
		where: { id: courseId, deletedAt: null },
		select: { id: true, schoolId: true },
	});

	if (!course) {
		throw AppError.notFound('Course not found');
	}

	const studentInSchool = await prisma.studentSchool.findFirst({
		where: {
			student: { userId: studentUserId },
			schoolId: course.schoolId,
			school: { deletedAt: null },
		},
	});

	if (!studentInSchool) {
		throw AppError.forbidden('Forbidden');
	}

	if (actorRole === Role.MANAGER || actorRole === Role.INSTRUCTOR) {
		await assertActorCanListStudentsForSchool(
			actorId,
			actorRole,
			course.schoolId,
		);
	} else {
		throw AppError.forbidden('Forbidden');
	}

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
