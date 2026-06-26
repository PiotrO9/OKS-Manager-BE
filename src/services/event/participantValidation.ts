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
	const links = await prisma.instructorSchool.findMany({
		where: {
			instructorId,
			school:
				actor.role === Role.MANAGER
					? { ownerId: actor.id, deletedAt: null }
					: { deletedAt: null },
		},
		select: { schoolId: true },
	});
	return links.map((l) => l.schoolId);
}

export async function assertStudentProfilesInAllowedSchools(
	db: Prisma.TransactionClient | ReturnType<typeof getPrisma>,
	profileIds: string[],
	allowedSchoolIds: string[],
): Promise<void> {
	if (profileIds.length === 0) {
		return;
	}
	if (allowedSchoolIds.length === 0) {
		throw AppError.unprocessableEntity(
			'No driving school context available for participant validation',
		);
	}
	const rows = await db.studentSchool.findMany({
		where: {
			studentId: { in: profileIds },
			schoolId: { in: allowedSchoolIds },
		},
		select: { studentId: true },
	});
	const covered = new Set(rows.map((r) => r.studentId));
	for (const pid of profileIds) {
		if (!covered.has(pid)) {
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

	const map = new Map<string, string>();
	for (const u of users) {
		if (
			u.deletedAt !== null ||
			u.role !== Role.STUDENT ||
			!u.studentProfile
		) {
			throw AppError.notFound('One or more students not found');
		}
		map.set(u.id, u.studentProfile.id);
	}
	return map;
}
