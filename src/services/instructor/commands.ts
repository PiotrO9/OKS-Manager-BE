import { Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { addInstructorToSchoolInTx } from '../../lib/instructorSchoolRegistration';
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
import type { Actor, InstructorPatchInput, InstructorPatchResult } from './types';

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
		select: { id: true },
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

	await prisma.$transaction(async (tx) => {
		await addInstructorToSchoolInTx(tx, profile.id, schoolId);
	});

	return { instructorId: profile.id, schoolId };
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
