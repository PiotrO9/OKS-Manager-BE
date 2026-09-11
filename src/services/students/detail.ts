import { Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import { assertActorCanListStudentsForSchool } from './access';
import { resolveActiveStudentSchoolId } from './schoolResolver';
import type { StudentDetailDto } from './types';

const prisma = getPrisma();

export async function getStudentDetail(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
): Promise<StudentDetailDto> {
	if (actorRole === Role.STUDENT && actorId !== studentUserId) {
		throw AppError.forbidden('Forbidden');
	}

	const schoolId = await resolveActiveStudentSchoolId(studentUserId);

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
			notes: true,
			user: {
				select: {
					id: true,
					firstName: true,
					lastName: true,
					email: true,
				},
			},
			courseParticipants: {
				where: {
					course: { schoolId, deletedAt: null },
				},
				select: {
					status: true,
					course: {
						select: {
							id: true,
							name: true,
							category: true,
						},
					},
				},
			},
		},
	});

	if (!student) {
		throw AppError.notFound('Student not found');
	}

	return {
		id: student.id,
		userId: student.user.id,
		schoolId,
		firstName: student.user.firstName,
		lastName: student.user.lastName,
		email: student.user.email,
		pkkNumber: student.pkkNumber,
		notes: student.notes,
		courses: student.courseParticipants.map((cp) => ({
			id: cp.course.id,
			name: cp.course.name,
			category: cp.course.category,
			status: cp.status,
		})),
	};
}
