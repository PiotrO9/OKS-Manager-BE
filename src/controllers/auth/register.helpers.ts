import type { Session, User } from '@supabase/supabase-js';
import { Response } from 'express';
import { Prisma, Role } from '@prisma/client';
import { sendJsonError, sendJsonSuccess } from '../../lib/apiResponse';
import { getPrisma } from '../../lib/prisma';
import type { RegisterBody } from './types';

export const REGISTRATION_TARGET_ROLES: ReadonlySet<Role> = new Set([
	Role.INSTRUCTOR,
	Role.STUDENT,
]);

export function parseRegistrationTargetRole(raw: unknown): Role | null {
	if (typeof raw !== 'string') {
		return null;
	}
	const v = raw.trim();
	if (v === Role.INSTRUCTOR || v === Role.STUDENT) {
		return v as Role;
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
			create: { licenseNumber: instructorLicenseTrimmed! },
		},
	};
}

export async function ensureRoleProfilesAfterUserUpsert(
	tx: Prisma.TransactionClient,
	userId: string,
	targetRole: Role,
	instructorLicenseTrimmed: string | null,
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
			data: { userId, licenseNumber: instructorLicenseTrimmed },
		});
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
		console.error('register: instructor profile missing after success', {
			authUserId,
		});
		return sendJsonError(res, 'Failed to create instructor', 500);
	}

	const nameFromParts = [firstName, lastName]
		.map((s) => String(s).trim())
		.filter((s) => s.length > 0)
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
