import { Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { validateInstructorRegistrationSchoolBeforeSignUp } from '../../lib/instructorSchoolRegistration';
import { getPrisma } from '../../lib/prisma';
import { validateStudentRegistrationSchoolBeforeSignUp } from '../../lib/studentSchoolRegistration';
import { parseUuidParam } from '../../lib/validation/uuid';
import type { AuthRequestUser } from '../../types/express';
import type { RegisterBody } from './types';

type RegistrationSchoolIds = {
	validatedInstructorSchoolId?: string;
	validatedStudentSchoolId?: string;
};

function hasExplicitSchool(raw: RegisterBody['schoolId']): boolean {
	return raw !== undefined && raw !== null && String(raw).trim() !== '';
}

function parseSchoolId(raw: RegisterBody['schoolId']): string {
	const schoolParse = parseUuidParam(raw);
	if (schoolParse === null || schoolParse === 'invalid') {
		throw AppError.badRequest('Invalid schoolId');
	}
	return schoolParse;
}

async function resolveInstructorSchoolId(
	actor: AuthRequestUser,
	body: RegisterBody,
	emailTrimmed: string,
): Promise<string> {
	const resolvedSchoolId = hasExplicitSchool(body.schoolId)
		? parseSchoolId(body.schoolId)
		: actor.role === Role.MANAGER
			? (actor.defaultOskId ?? null)
			: null;

	if (resolvedSchoolId === null) {
		throw AppError.badRequest(
			actor.role === Role.MANAGER
				? 'Manager has no default school assigned'
				: 'schoolId is required when role is INSTRUCTOR',
		);
	}

	await validateInstructorRegistrationSchoolBeforeSignUp(
		getPrisma(),
		actor.role,
		actor.id,
		emailTrimmed,
		resolvedSchoolId,
	);

	return resolvedSchoolId;
}

async function validateStudentSchool(
	actor: AuthRequestUser,
	schoolId: string,
): Promise<string> {
	await validateStudentRegistrationSchoolBeforeSignUp(
		getPrisma(),
		actor.role,
		actor.id,
		schoolId,
	);
	return schoolId;
}

async function resolveStudentSchoolIdForInstructor(
	actor: AuthRequestUser,
	body: RegisterBody,
): Promise<string | undefined> {
	if (hasExplicitSchool(body.schoolId)) {
		return validateStudentSchool(actor, parseSchoolId(body.schoolId));
	}

	const instructorLinks = await getPrisma().instructorSchool.findMany({
		where: {
			instructor: { userId: actor.id },
			school: { deletedAt: null },
		},
		select: { schoolId: true },
	});

	if (instructorLinks.length === 0) {
		throw AppError.badRequest('Instructor is not assigned to any school');
	}
	if (instructorLinks.length > 1) {
		throw AppError.badRequest(
			'schoolId is required when instructor belongs to multiple schools',
		);
	}

	return validateStudentSchool(actor, instructorLinks[0]!.schoolId);
}

async function resolveStudentSchoolId(
	actor: AuthRequestUser,
	body: RegisterBody,
): Promise<string | undefined> {
	if (actor.role === Role.ADMIN) {
		return hasExplicitSchool(body.schoolId)
			? validateStudentSchool(actor, parseSchoolId(body.schoolId))
			: undefined;
	}

	if (actor.role === Role.MANAGER) {
		const resolvedSchoolId = hasExplicitSchool(body.schoolId)
			? parseSchoolId(body.schoolId)
			: (actor.defaultOskId ?? null);

		if (resolvedSchoolId === null) {
			throw AppError.badRequest('Manager has no default school assigned');
		}

		return validateStudentSchool(actor, resolvedSchoolId);
	}

	if (actor.role === Role.INSTRUCTOR) {
		return resolveStudentSchoolIdForInstructor(actor, body);
	}

	return undefined;
}

export async function resolveRegistrationSchoolIds(
	actor: AuthRequestUser,
	body: RegisterBody,
	targetRole: Role,
	emailTrimmed: string,
): Promise<RegistrationSchoolIds> {
	if (targetRole === Role.INSTRUCTOR) {
		return {
			validatedInstructorSchoolId: await resolveInstructorSchoolId(
				actor,
				body,
				emailTrimmed,
			),
		};
	}

	if (targetRole === Role.STUDENT) {
		return {
			validatedStudentSchoolId: await resolveStudentSchoolId(actor, body),
		};
	}

	return {};
}
