import { Role, type Prisma } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import { mapQualifiedCourseTypes } from './mappers';
import type { Actor, InstructorPatchInput, InstructorPatchResult } from './types';

const prisma = getPrisma();

type InstructorSchoolsForOwnership = Array<{
	school: { ownerId: string; deletedAt: Date | null };
}>;

type InstructorPatchResultProjection = {
	id: string;
	experienceYears: number | null;
	qualifications: string | null;
	user: {
		firstName: string;
		lastName: string;
		email: string;
	};
	qualifiedCourseTypes: Array<{
		id: string;
		code: string;
		name: string;
	}>;
};

export function assertActorCanManageInstructors(actor: Actor): void {
	if (actor.role !== Role.ADMIN && actor.role !== Role.MANAGER) {
		throw AppError.forbidden('Forbidden');
	}
}

export function assertManagerOwnsInstructorSchool(
	actor: Actor,
	instructorSchools: InstructorSchoolsForOwnership,
	hasOwnedSchool: (
		schools: InstructorSchoolsForOwnership,
		actorId: string,
	) => boolean,
): void {
	if (
		actor.role === Role.MANAGER &&
		!hasOwnedSchool(instructorSchools, actor.id)
	) {
		throw AppError.forbidden('Forbidden');
	}
}

export function buildInstructorUserUpdate(
	patch: InstructorPatchInput,
): { firstName?: string; lastName?: string } {
	const userUpdate: { firstName?: string; lastName?: string } = {};

	if (patch.firstName !== undefined) {
		userUpdate.firstName = patch.firstName;
	}
	if (patch.lastName !== undefined) {
		userUpdate.lastName = patch.lastName;
	}

	return userUpdate;
}

export function buildInstructorProfileUpdate(
	patch: InstructorPatchInput,
): Prisma.InstructorProfileUpdateManyMutationInput {
	const profileUpdateData: Prisma.InstructorProfileUpdateManyMutationInput =
		{};

	if (patch.experienceYears !== undefined) {
		profileUpdateData.experienceYears = patch.experienceYears;
	}
	if (patch.qualifications !== undefined) {
		profileUpdateData.qualifications = patch.qualifications;
	}

	return profileUpdateData;
}

export function hasInstructorProfilePatch(patch: InstructorPatchInput): boolean {
	return (
		patch.experienceYears !== undefined ||
		patch.qualifications !== undefined
	);
}

export function hasInstructorPatch(
	patch: InstructorPatchInput,
	userUpdate: { firstName?: string; lastName?: string },
): boolean {
	return (
		Object.keys(userUpdate).length > 0 ||
		hasInstructorProfilePatch(patch) ||
		patch.qualifiedCourseTypeIds !== undefined
	);
}

export async function assertQualifiedCourseTypeIdsExist(
	ids: string[] | undefined,
): Promise<void> {
	if (ids === undefined || ids.length === 0) {
		return;
	}

	const found = await prisma.courseType.count({
		where: { id: { in: ids } },
	});
	if (found !== ids.length) {
		throw AppError.badRequest('Invalid qualifiedCourseTypeIds');
	}
}

export function mapInstructorPatchResult(
	profile: InstructorPatchResultProjection,
): InstructorPatchResult {
	return {
		id: profile.id,
		firstName: profile.user.firstName,
		lastName: profile.user.lastName,
		email: profile.user.email,
		experienceYears: profile.experienceYears,
		qualifications: profile.qualifications,
		qualifiedCourseTypes: mapQualifiedCourseTypes(
			profile.qualifiedCourseTypes,
		),
	};
}
