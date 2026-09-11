import { Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import {
	activeInstructorProfileWhere,
	activeInstructorUserByIdWhere,
	hasInstructorSchoolOwnedByActor,
} from './access';
import { qualifiedCourseTypesSelect } from './mappers';
import {
	assertActorCanManageInstructors,
	assertManagerOwnsInstructorSchool,
	assertQualifiedCourseTypeIdsExist,
	buildInstructorProfileUpdate,
	buildInstructorUserUpdate,
	hasInstructorPatch,
	hasInstructorProfilePatch,
	mapInstructorPatchResult,
} from './commandHelpers';
import type {
	Actor,
	InstructorPatchInput,
	InstructorPatchResult,
} from './types';

const prisma = getPrisma();

export async function updateInstructorForManagerOrAdmin(
	actor: Actor,
	instructorId: string,
	patch: InstructorPatchInput,
): Promise<InstructorPatchResult> {
	assertActorCanManageInstructors(actor);

	const profile = await prisma.instructorProfile.findFirst({
		where: activeInstructorProfileWhere(instructorId),
		select: {
			id: true,
			userId: true,
			experienceYears: true,
			qualifications: true,
			user: {
				select: {
					firstName: true,
					lastName: true,
					email: true,
				},
			},
			instructorSchools: {
				select: {
					schoolId: true,
					school: {
						select: { ownerId: true, deletedAt: true },
					},
				},
			},
			qualifiedCourseTypes: {
				select: qualifiedCourseTypesSelect,
				orderBy: { code: 'asc' },
			},
		},
	});

	if (!profile) {
		throw AppError.notFound('Instructor not found');
	}

	assertManagerOwnsInstructorSchool(
		actor,
		profile.instructorSchools,
		hasInstructorSchoolOwnedByActor,
	);

	const userUpdate = buildInstructorUserUpdate(patch);
	const hasUserUpdate = Object.keys(userUpdate).length > 0;
	const hasProfileUpdate = hasInstructorProfilePatch(patch);
	const hasQualifiedCourseTypesUpdate =
		patch.qualifiedCourseTypeIds !== undefined;

	if (!hasInstructorPatch(patch, userUpdate)) {
		return mapInstructorPatchResult(profile);
	}

	await assertQualifiedCourseTypeIdsExist(patch.qualifiedCourseTypeIds);
	const profileUpdateData = buildInstructorProfileUpdate(patch);

	if (hasProfileUpdate) {
		const { count } = await prisma.instructorProfile.updateMany({
			where: activeInstructorProfileWhere(instructorId),
			data: profileUpdateData,
		});
		if (count === 0) {
			throw AppError.notFound('Instructor not found');
		}
	}

	if (hasUserUpdate) {
		const { count } = await prisma.user.updateMany({
			where: activeInstructorUserByIdWhere(profile.userId),
			data: userUpdate,
		});
		if (count === 0) {
			throw AppError.notFound('Instructor not found');
		}
	}

	if (hasQualifiedCourseTypesUpdate) {
		await prisma.instructorProfile.update({
			where: { id: instructorId },
			data: {
				qualifiedCourseTypes: {
					set: (patch.qualifiedCourseTypeIds ?? []).map((id) => ({
						id,
					})),
				},
			},
		});
	}

	const fresh = await prisma.instructorProfile.findFirst({
		where: activeInstructorProfileWhere(instructorId),
		select: {
			id: true,
			experienceYears: true,
			qualifications: true,
			user: {
				select: {
					firstName: true,
					lastName: true,
					email: true,
				},
			},
			qualifiedCourseTypes: {
				select: qualifiedCourseTypesSelect,
				orderBy: { code: 'asc' },
			},
		},
	});

	if (!fresh) {
		throw AppError.notFound('Instructor not found');
	}

	return mapInstructorPatchResult(fresh);
}

export async function assignInstructorToSchoolForManagerOrAdmin(
	actor: Actor,
	instructorId: string,
	schoolId: string,
): Promise<{ instructorId: string; schoolId: string }> {
	assertActorCanManageInstructors(actor);

	const profile = await prisma.instructorProfile.findFirst({
		where: activeInstructorProfileWhere(instructorId),
		select: {
			id: true,
			userId: true,
			instructorSchools: {
				select: {
					schoolId: true,
					school: {
						select: { ownerId: true, deletedAt: true },
					},
				},
			},
		},
	});

	if (!profile) {
		throw AppError.notFound('Instructor not found');
	}

	const school = await prisma.drivingSchool.findUnique({
		where: { id: schoolId },
		select: { id: true, ownerId: true, deletedAt: true },
	});

	if (!school || school.deletedAt !== null) {
		throw AppError.badRequest('Invalid schoolId');
	}

	if (actor.role === Role.MANAGER && school.ownerId !== actor.id) {
		throw AppError.forbidden('Forbidden');
	}

	assertManagerOwnsInstructorSchool(
		actor,
		profile.instructorSchools,
		hasInstructorSchoolOwnedByActor,
	);

	const activeLinks = profile.instructorSchools.filter(
		(row) => row.school.deletedAt === null,
	);

	if (activeLinks.length > 1) {
		throw AppError.conflict(
			'Instructor is assigned to multiple active driving schools',
		);
	}

	const currentSchoolId = activeLinks[0]?.schoolId ?? null;

	if (currentSchoolId === schoolId) {
		return { instructorId: profile.id, schoolId };
	}

	await assertInstructorCanChangeSchool(profile.id, currentSchoolId);

	await prisma.$transaction(async (tx) => {
		await tx.instructorSchool.deleteMany({
			where: { instructorId: profile.id },
		});
		await tx.instructorSchool.create({
			data: { instructorId: profile.id, schoolId },
		});
		await tx.user.update({
			where: { id: profile.userId },
			data: { defaultOskId: schoolId },
		});
	});

	return { instructorId: profile.id, schoolId };
}

async function assertInstructorCanChangeSchool(
	instructorId: string,
	currentSchoolId: string | null,
): Promise<void> {
	if (!currentSchoolId) {
		return;
	}

	const now = new Date();
	const [futureLessons, activeEvents, assignedCourses, futureBlocks] =
		await Promise.all([
			prisma.lesson.count({
				where: {
					instructorId,
					deletedAt: null,
					startTime: { gte: now },
					course: { schoolId: currentSchoolId, deletedAt: null },
				},
			}),
			prisma.instructorEvent.count({
				where: {
					instructorId,
					schoolId: currentSchoolId,
					isActive: true,
					startTime: { gte: now },
				},
			}),
			prisma.course.count({
				where: {
					instructorId,
					schoolId: currentSchoolId,
					deletedAt: null,
					status: 'active',
				},
			}),
			prisma.instructorTimeBlock.count({
				where: {
					instructorId,
					schoolId: currentSchoolId,
					startTime: { gte: now },
				},
			}),
		]);

	if (
		futureLessons > 0 ||
		activeEvents > 0 ||
		assignedCourses > 0 ||
		futureBlocks > 0
	) {
		throw AppError.conflict(
			'Instructor has active obligations in the current driving school',
		);
	}
}

export async function softDeleteInstructorForManagerOrAdmin(
	actor: Actor,
	instructorId: string,
): Promise<void> {
	assertActorCanManageInstructors(actor);

	const profile = await prisma.instructorProfile.findFirst({
		where: activeInstructorProfileWhere(instructorId),
		select: {
			userId: true,
			instructorSchools: {
				select: {
					schoolId: true,
					school: {
						select: { ownerId: true, deletedAt: true },
					},
				},
			},
		},
	});

	if (!profile) {
		throw AppError.notFound('Instructor not found');
	}

	assertManagerOwnsInstructorSchool(
		actor,
		profile.instructorSchools,
		hasInstructorSchoolOwnedByActor,
	);

	const { count } = await prisma.user.updateMany({
		where: activeInstructorUserByIdWhere(profile.userId),
		data: { isActive: false },
	});

	if (count === 0) {
		throw AppError.notFound('Instructor not found');
	}
}
