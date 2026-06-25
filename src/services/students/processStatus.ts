import { LessonStatus, Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import { assertActorCanListStudentsForSchool } from './access';
import type { StudentProcessStatusDto } from './types';
import { buildStudentProcessStatusSteps, hasText } from './utils';

const prisma = getPrisma();

export async function getStudentProcessStatus(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	schoolId: string,
): Promise<StudentProcessStatusDto> {
	if (actorRole === Role.STUDENT && actorId !== studentUserId) {
		throw AppError.forbidden('Forbidden');
	}

	if (actorRole !== Role.STUDENT) {
		await assertActorCanListStudentsForSchool(actorId, actorRole, schoolId);
	}

	const student = await prisma.studentProfile.findFirst({
		where: {
			userId: studentUserId,
			user: { deletedAt: null },
			studentSchools: {
				some: { schoolId, school: { deletedAt: null } },
			},
		},
		select: {
			id: true,
			pkkNumber: true,
			user: {
				select: {
					firstName: true,
					lastName: true,
					email: true,
					isActive: true,
				},
			},
			courseParticipants: {
				where: { course: { schoolId, deletedAt: null } },
				select: { id: true },
				take: 1,
			},
		},
	});

	if (!student) {
		throw AppError.notFound('Student not found');
	}

	const scheduledLesson = await prisma.lesson.findFirst({
		where: {
			studentId: student.id,
			deletedAt: null,
			status: { not: LessonStatus.CANCELLED },
			course: { schoolId, deletedAt: null },
		},
		select: { id: true },
	});

	return {
		steps: buildStudentProcessStatusSteps({
			hasBasicData:
				student.user.isActive &&
				hasText(student.user.firstName) &&
				hasText(student.user.lastName) &&
				hasText(student.user.email),
			hasPkkNumber: hasText(student.pkkNumber),
			hasCourseAssignment: student.courseParticipants.length > 0,
			hasScheduledLesson: scheduledLesson !== null,
		}),
	};
}
