import { Prisma, Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { attachInstructorToSchoolWithDefaultsInTx } from '../../lib/instructorSchoolRegistration';
import { getPrisma } from '../../lib/prisma';
import { attachStudentToSchoolReplaceInTx } from '../../lib/studentSchoolRegistration';
import {
	buildUserCreateWithRoleProfiles,
	ensureRoleProfilesAfterUserUpsert,
	registerDbFailureClientMessage,
	registerDbProfileFromRequest,
} from './register.helpers';
import type { RegisterBody } from './types';

type PersistRegisteredUserInput = {
	authUserId: string;
	emailTrimmed: string;
	firstName: string;
	lastName: string;
	targetRole: Role;
	phone: RegisterBody['phone'];
	instructorLicenseTrimmed: string | null;
	validatedInstructorSchoolId?: string;
	validatedStudentSchoolId?: string;
};

async function updateRegisteredUserInTx(
	tx: Prisma.TransactionClient,
	input: PersistRegisteredUserInput,
): Promise<void> {
	const profileData = registerDbProfileFromRequest(
		input.emailTrimmed,
		input.firstName,
		input.lastName,
		input.targetRole,
		input.phone,
	);

	await tx.user.update({
		where: { id: input.authUserId },
		data: profileData,
	});
	await ensureRoleProfilesAfterUserUpsert(
		tx,
		input.authUserId,
		input.targetRole,
		input.instructorLicenseTrimmed,
	);
	await attachRoleSchoolInTx(tx, input);
}

async function attachRoleSchoolInTx(
	tx: Prisma.TransactionClient,
	input: PersistRegisteredUserInput,
): Promise<void> {
	if (
		input.targetRole === Role.INSTRUCTOR &&
		input.validatedInstructorSchoolId
	) {
		await attachInstructorToSchoolWithDefaultsInTx(
			tx,
			input.authUserId,
			input.validatedInstructorSchoolId,
		);
	}
	if (input.targetRole === Role.STUDENT && input.validatedStudentSchoolId) {
		await attachStudentToSchoolReplaceInTx(
			tx,
			input.authUserId,
			input.validatedStudentSchoolId,
		);
	}
}

async function updateExistingRegisteredUser(
	input: PersistRegisteredUserInput,
	logContext: string,
): Promise<void> {
	try {
		await getPrisma().$transaction(async (tx) => {
			await updateRegisteredUserInTx(tx, input);
		});
	} catch (err) {
		if (err instanceof AppError) {
			throw err;
		}
		console.error(logContext, err);
		throw AppError.internal(registerDbFailureClientMessage(input.targetRole));
	}
}

export async function persistRegisteredUser(
	input: PersistRegisteredUserInput,
): Promise<void> {
	const prisma = getPrisma();
	const existingById = await prisma.user.findUnique({
		where: { id: input.authUserId },
	});

	if (existingById) {
		if (existingById.email !== input.emailTrimmed) {
			throw AppError.conflict(
				'Account identifier already in use with a different email',
			);
		}

		await updateExistingRegisteredUser(
			input,
			'register: user.update failed (existingById)',
		);
		return;
	}

	const existingByEmail = await prisma.user.findUnique({
		where: { email: input.emailTrimmed },
	});
	if (existingByEmail) {
		console.error(
			'register: email exists in app DB under different id after signUp - orphan Auth user possible',
			{ authUserId: input.authUserId, existingUserId: existingByEmail.id },
		);
		throw AppError.conflict('Email already registered');
	}

	const profileFields = registerDbProfileFromRequest(
		input.emailTrimmed,
		input.firstName,
		input.lastName,
		input.targetRole,
		input.phone,
	);
	const userCreateData = buildUserCreateWithRoleProfiles(
		input.authUserId,
		profileFields,
		input.targetRole,
		input.instructorLicenseTrimmed,
	);

	try {
		await prisma.$transaction(async (tx) => {
			await tx.user.create({ data: userCreateData });
			await attachRoleSchoolInTx(tx, input);
		});
	} catch (err) {
		if (err instanceof AppError) {
			throw err;
		}

		const isUnique =
			err instanceof Prisma.PrismaClientKnownRequestError &&
			err.code === 'P2002';

		if (isUnique) {
			const row = await prisma.user.findUnique({
				where: { id: input.authUserId },
			});
			if (row && row.email === input.emailTrimmed) {
				await updateExistingRegisteredUser(
					input,
					'register: user.update failed after P2002',
				);
				return;
			}
		}

		console.error(
			'register: Prisma user.create failed after signUp - orphan auth user may exist',
			err,
		);
		throw AppError.internal(registerDbFailureClientMessage(input.targetRole));
	}
}
