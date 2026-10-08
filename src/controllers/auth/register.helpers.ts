import type { Session, User } from '@supabase/supabase-js';
import { Response } from 'express';
import { Prisma, Role } from '@prisma/client';
import { sendJsonError, sendJsonSuccess } from '../../lib/apiResponse';
import { logger } from '../../lib/logger';
import { getPrisma } from '../../lib/prisma';
import { AppError } from '../../lib/http/AppError';
import type { RegisterBody } from './types';

export const REGISTRATION_TARGET_ROLES: ReadonlySet<Role> = new Set([
	Role.INSTRUCTOR,
	Role.STUDENT,
]);

export function parseRegistrationTargetRole(raw: unknown): Role | null {
	if (typeof raw !== 'string') {
		return null;
	}
	const trimmedValue = raw.trim();
	if (trimmedValue === Role.INSTRUCTOR || trimmedValue === Role.STUDENT) {
		return trimmedValue as Role;
	}
	return null;
}

export function instructorLicenseFromRegisterBody(
	body: RegisterBody,
	targetRole: Role,
): string | null {
	if (targetRole !== Role.INSTRUCTOR) {
		return null;
	}
	const raw = body.licenseNumber;
	if (raw === undefined || raw === null) {
		return null;
	}
	const trimmed = String(raw).trim();
	return trimmed === '' ? null : trimmed;
}

export function buildUserCreateWithRoleProfiles(
	authUserId: string,
	profileFields: ReturnType<typeof registerDbProfileFromRequest>,
	targetRole: Role,
	instructorLicenseTrimmed: string | null,
	instructorBirthDate: Date | null = null,
): Prisma.UserCreateInput {
	const base: Prisma.UserCreateInput = {
		id: authUserId,
		...profileFields,
	};
	if (targetRole === Role.STUDENT) {
		return {
			...base,
			profile: { create: {} },
			studentProfile: { create: {} },
		};
	}
	return {
		...base,
		profile: { create: {} },
		instructorProfile: {
			create: {
				licenseNumber: instructorLicenseTrimmed!,
				birthDate: instructorBirthDate,
			},
		},
	};
}

export async function ensureRoleProfilesAfterUserUpsert(
	tx: Prisma.TransactionClient,
	userId: string,
	targetRole: Role,
	instructorLicenseTrimmed: string | null,
	instructorBirthDate: Date | null = null,
) {
	const user = await tx.user.findUnique({
		where: { id: userId },
		select: {
			profile: { select: { id: true } },
			studentProfile: { select: { id: true } },
			instructorProfile: { select: { id: true } },
		},
	});
	if (!user) {
		return;
	}

	if (!user.profile) {
		await tx.userProfile.create({ data: { userId } });
	}

	if (targetRole === Role.STUDENT && !user.studentProfile) {
		await tx.studentProfile.create({ data: { userId } });
	}

	if (targetRole === Role.INSTRUCTOR && !user.instructorProfile) {
		if (!instructorLicenseTrimmed) {
			throw new Error(
				'ensureRoleProfilesAfterUserUpsert: licenseNumber required for instructor',
			);
		}
		await tx.instructorProfile.create({
			data: {
				userId,
				licenseNumber: instructorLicenseTrimmed,
				birthDate: instructorBirthDate,
			},
		});
	}
	if (
		targetRole === Role.INSTRUCTOR &&
		user.instructorProfile &&
		instructorBirthDate
	) {
		const { count } = await tx.instructorProfile.updateMany({
			where: {
				userId,
				OR: [{ birthDate: null }, { birthDate: instructorBirthDate }],
			},
			data: { birthDate: instructorBirthDate },
		});
		if (count !== 1) {
			throw AppError.conflict(
				'Instructor birthDate already set to a different value',
			);
		}
	}
}

export function registerDbProfileFromRequest(
	emailTrimmed: string,
	firstName: string,
	lastName: string,
	targetRole: Role,
	phone: RegisterBody['phone'],
) {
	return {
		email: emailTrimmed,
		firstName: String(firstName).trim(),
		lastName: String(lastName).trim(),
		role: targetRole,
		phone:
			phone !== undefined && phone !== null && String(phone).trim() !== ''
				? String(phone).trim()
				: null,
	};
}

export function registerDbFailureClientMessage(targetRole: Role): string {
	return targetRole === Role.INSTRUCTOR
		? 'Failed to create instructor'
		: 'Failed to complete user registration';
}

export async function completeRegisterSuccessResponse(
	res: Response,
	targetRole: Role,
	authUserId: string,
	emailTrimmed: string,
	firstName: string,
	lastName: string,
	authPayload: { user: User; session: Session | null },
): Promise<Response> {
	if (targetRole !== Role.INSTRUCTOR) {
		return sendJsonSuccess(res, {
			user: authPayload.user,
			session: authPayload.session,
		});
	}

	const prisma = getPrisma();
	const profile = await prisma.instructorProfile.findUnique({
		where: { userId: authUserId },
		select: { id: true },
	});
	if (!profile) {
		logger.error('register: instructor profile missing after success', {
			authUserId,
		});
		return sendJsonError(res, 'Failed to create instructor', 500);
	}

	const nameFromParts = [firstName, lastName]
		.map((entry) => String(entry).trim())
		.filter((entry) => entry.length > 0)
		.join(' ')
		.trim();

	return sendJsonSuccess(
		res,
		{
			instructor: {
				id: profile.id,
				userId: authUserId,
				name: nameFromParts || emailTrimmed,
				email: emailTrimmed,
			},
			user: authPayload.user,
			session: authPayload.session,
		},
		201,
	);
}
