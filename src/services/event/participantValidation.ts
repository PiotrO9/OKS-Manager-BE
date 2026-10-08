import { EventType, Prisma, Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';

const prisma = getPrisma();

export function assertEventTypeAllowsParticipants(eventType: EventType): void {
	if (eventType !== EventType.THEORY) {
		throw AppError.unprocessableEntity(
			'Student participants are only supported for THEORY events',
		);
	}
}

export async function getSchoolIdsForEventParticipantValidation(
	actor: { id: string; role: Role },
	instructorId: string,
): Promise<string[]> {
	if (actor.role !== Role.MANAGER && actor.role !== Role.ADMIN) {
		throw AppError.forbidden('Forbidden');
	}
	const instructorSchools = await prisma.instructorSchool.findMany({
		where: {
			instructorId,
			school:
				actor.role === Role.MANAGER
					? { ownerId: actor.id, deletedAt: null }
					: { deletedAt: null },
		},
		select: { schoolId: true },
	});
	return instructorSchools.map(
		(instructorSchool) => instructorSchool.schoolId,
	);
}

export async function assertStudentProfilesInAllowedSchools(
	database: Prisma.TransactionClient | ReturnType<typeof getPrisma>,
	studentProfileIds: string[],
	allowedSchoolIds: string[],
): Promise<void> {
	if (studentProfileIds.length === 0) {
		return;
	}
	if (allowedSchoolIds.length === 0) {
		throw AppError.unprocessableEntity(
			'No driving school context available for participant validation',
		);
	}
	const studentSchools = await database.studentSchool.findMany({
		where: {
			studentId: { in: studentProfileIds },
			schoolId: { in: allowedSchoolIds },
		},
		select: { studentId: true },
	});
	const coveredStudentProfileIds = new Set(
		studentSchools.map((studentSchool) => studentSchool.studentId),
	);
	for (const studentProfileId of studentProfileIds) {
		if (!coveredStudentProfileIds.has(studentProfileId)) {
			throw AppError.unprocessableEntity(
				'One or more students are not enrolled in a driving school linked to this event',
			);
		}
	}
}

export async function loadActiveStudentUserIdToProfileIdMap(
	uniqueUserIds: string[],
): Promise<Map<string, string>> {
	if (uniqueUserIds.length === 0) {
		return new Map();
	}
	const users = await prisma.user.findMany({
		where: { id: { in: uniqueUserIds } },
		select: {
			id: true,
			role: true,
			deletedAt: true,
			studentProfile: { select: { id: true } },
		},
	});

	if (users.length !== uniqueUserIds.length) {
		throw AppError.notFound('One or more students not found');
	}

	const userIdToStudentProfileId = new Map<string, string>();
	for (const user of users) {
		if (
			user.deletedAt !== null ||
			user.role !== Role.STUDENT ||
			!user.studentProfile
		) {
			throw AppError.notFound('One or more students not found');
		}
		userIdToStudentProfileId.set(user.id, user.studentProfile.id);
	}
	return userIdToStudentProfileId;
}
