import { Request, Response } from 'express';
import { Prisma, Role } from '@prisma/client';
import { sendJsonError } from '../../lib/apiResponse';
import { AppError } from '../../lib/http/AppError';
import {
	attachInstructorToSchoolWithDefaultsInTx,
	validateInstructorRegistrationSchoolBeforeSignUp,
} from '../../lib/instructorSchoolRegistration';
import { canInvokerRegisterUserWithRole } from '../../lib/registerRolePolicy';
import {
	attachStudentToSchoolReplaceInTx,
	validateStudentRegistrationSchoolBeforeSignUp,
} from '../../lib/studentSchoolRegistration';
import { getPrisma } from '../../lib/prisma';
import { getSupabaseClient } from '../../lib/supabase';
import {
	logAuthSignUpError,
	mapAuthSignUpErrorForClient,
} from '../../lib/supabaseSignUpErrors';
import { parseUuidParam } from '../../lib/validation/uuid';
import {
	buildUserCreateWithRoleProfiles,
	completeRegisterSuccessResponse,
	ensureRoleProfilesAfterUserUpsert,
	instructorLicenseFromRegisterBody,
	parseRegistrationTargetRole,
	registerDbFailureClientMessage,
	registerDbProfileFromRequest,
	REGISTRATION_TARGET_ROLES,
} from './register.helpers';
import type { RegisterBody, RequestWithUser } from './types';

export async function register(req: Request, res: Response) {
	const actor = (req as RequestWithUser).user;
	const body: RegisterBody = req.body;
	const { email, password, role: roleRaw, firstName, lastName, phone } = body;

	if (!email || !password || !roleRaw || !firstName || !lastName) {
		return sendJsonError(
			res,
			'Email, password, role, firstName and lastName required',
			400,
		);
	}

	const targetRole = parseRegistrationTargetRole(roleRaw);
	if (!targetRole || !REGISTRATION_TARGET_ROLES.has(targetRole)) {
		return sendJsonError(
			res,
			'Invalid role for registration (expected INSTRUCTOR or STUDENT)',
			400,
		);
	}

	const instructorLicenseTrimmed = instructorLicenseFromRegisterBody(
		body,
		targetRole,
	);
	if (targetRole === Role.INSTRUCTOR && !instructorLicenseTrimmed) {
		return sendJsonError(
			res,
			'licenseNumber is required when role is INSTRUCTOR',
			400,
		);
	}

	if (!canInvokerRegisterUserWithRole(actor.role, targetRole)) {
		return sendJsonError(res, 'Forbidden', 403);
	}

	const emailTrimmed = String(email).trim();

	let validatedInstructorSchoolId: string | undefined;
	if (targetRole === Role.INSTRUCTOR) {
		const rawSchool = body.schoolId;
		const hasExplicitSchool =
			rawSchool !== undefined &&
			rawSchool !== null &&
			String(rawSchool).trim() !== '';

		let resolvedSchoolId: string | null;

		if (hasExplicitSchool) {
			const schoolParse = parseUuidParam(body.schoolId);
			if (schoolParse === null || schoolParse === 'invalid') {
				return sendJsonError(res, 'Invalid schoolId', 400);
			}
			resolvedSchoolId = schoolParse;
		} else {
			resolvedSchoolId =
				actor.role === Role.MANAGER
					? (actor.defaultOskId ?? null)
					: null;
		}

		if (resolvedSchoolId === null) {
			return sendJsonError(
				res,
				actor.role === Role.MANAGER
					? 'Manager has no default school assigned'
					: 'schoolId is required when role is INSTRUCTOR',
				400,
			);
		}

		validatedInstructorSchoolId = resolvedSchoolId;
		try {
			await validateInstructorRegistrationSchoolBeforeSignUp(
				getPrisma(),
				actor.role,
				actor.id,
				emailTrimmed,
				validatedInstructorSchoolId,
			);
		} catch (err) {
			if (err instanceof AppError) {
				return sendJsonError(res, err.message, err.statusCode);
			}
			throw err;
		}
	}

	let validatedStudentSchoolId: string | undefined;
	if (targetRole === Role.STUDENT) {
		const prismaForSchool = getPrisma();
		const rawStudentSchool = body.schoolId;
		const hasExplicitStudentSchool =
			rawStudentSchool !== undefined &&
			rawStudentSchool !== null &&
			String(rawStudentSchool).trim() !== '';

		if (actor.role === Role.ADMIN) {
			if (hasExplicitStudentSchool) {
				const schoolParse = parseUuidParam(body.schoolId);
				if (schoolParse === null || schoolParse === 'invalid') {
					return sendJsonError(res, 'Invalid schoolId', 400);
				}
				try {
					await validateStudentRegistrationSchoolBeforeSignUp(
						prismaForSchool,
						actor.role,
						actor.id,
						schoolParse,
					);
				} catch (err) {
					if (err instanceof AppError) {
						return sendJsonError(res, err.message, err.statusCode);
					}
					throw err;
				}
				validatedStudentSchoolId = schoolParse;
			}
		} else if (actor.role === Role.MANAGER) {
			let resolvedStudentSchoolId: string | null;
			if (hasExplicitStudentSchool) {
				const schoolParse = parseUuidParam(body.schoolId);
				if (schoolParse === null || schoolParse === 'invalid') {
					return sendJsonError(res, 'Invalid schoolId', 400);
				}
				resolvedStudentSchoolId = schoolParse;
			} else {
				resolvedStudentSchoolId = actor.defaultOskId ?? null;
			}
			if (resolvedStudentSchoolId === null) {
				return sendJsonError(
					res,
					'Manager has no default school assigned',
					400,
				);
			}
			try {
				await validateStudentRegistrationSchoolBeforeSignUp(
					prismaForSchool,
					actor.role,
					actor.id,
					resolvedStudentSchoolId,
				);
			} catch (err) {
				if (err instanceof AppError) {
					return sendJsonError(res, err.message, err.statusCode);
				}
				throw err;
			}
			validatedStudentSchoolId = resolvedStudentSchoolId;
		} else if (actor.role === Role.INSTRUCTOR) {
			if (hasExplicitStudentSchool) {
				const schoolParse = parseUuidParam(body.schoolId);
				if (schoolParse === null || schoolParse === 'invalid') {
					return sendJsonError(res, 'Invalid schoolId', 400);
				}
				const resolvedStudentSchoolId = schoolParse;
				try {
					await validateStudentRegistrationSchoolBeforeSignUp(
						prismaForSchool,
						actor.role,
						actor.id,
						resolvedStudentSchoolId,
					);
				} catch (err) {
					if (err instanceof AppError) {
						return sendJsonError(res, err.message, err.statusCode);
					}
					throw err;
				}
				validatedStudentSchoolId = resolvedStudentSchoolId;
			} else {
				const instructorLinks =
					await prismaForSchool.instructorSchool.findMany({
						where: {
							instructor: { userId: actor.id },
							school: { deletedAt: null },
						},
						select: { schoolId: true },
					});
				if (instructorLinks.length === 0) {
					return sendJsonError(
						res,
						'Instructor is not assigned to any school',
						400,
					);
				}
				if (instructorLinks.length > 1) {
					return sendJsonError(
						res,
						'schoolId is required when instructor belongs to multiple schools',
						400,
					);
				}
				const resolvedStudentSchoolId = instructorLinks[0]!.schoolId;
				try {
					await validateStudentRegistrationSchoolBeforeSignUp(
						prismaForSchool,
						actor.role,
						actor.id,
						resolvedStudentSchoolId,
					);
				} catch (err) {
					if (err instanceof AppError) {
						return sendJsonError(res, err.message, err.statusCode);
					}
					throw err;
				}
				validatedStudentSchoolId = resolvedStudentSchoolId;
			}
		}
	}

	const supabase = getSupabaseClient();

	const { data, error } = await supabase.auth.signUp({
		email: emailTrimmed,
		password,
	});

	if (error) {
		logAuthSignUpError(error);
		const mapped = mapAuthSignUpErrorForClient(error);
		return sendJsonError(res, mapped.clientMessage, mapped.statusCode);
	}

	const authUserId = data.user?.id;
	if (!authUserId) {
		console.error('register: signUp succeeded but no user id returned');
		return sendJsonError(res, 'Registration incomplete', 500);
	}

	const prisma = getPrisma();

	const existingById = await prisma.user.findUnique({
		where: { id: authUserId },
	});
	if (existingById) {
		if (existingById.email !== emailTrimmed) {
			return sendJsonError(
				res,
				'Account identifier already in use with a different email',
				409,
			);
		}

		const profileData = registerDbProfileFromRequest(
			emailTrimmed,
			firstName,
			lastName,
			targetRole,
			phone,
		);

		try {
			await prisma.$transaction(async (tx) => {
				await tx.user.update({
					where: { id: authUserId },
					data: profileData,
				});
				await ensureRoleProfilesAfterUserUpsert(
					tx,
					authUserId,
					targetRole,
					instructorLicenseTrimmed,
				);
				if (
					targetRole === Role.INSTRUCTOR &&
					validatedInstructorSchoolId
				) {
					await attachInstructorToSchoolWithDefaultsInTx(
						tx,
						authUserId,
						validatedInstructorSchoolId,
					);
				}
				if (targetRole === Role.STUDENT && validatedStudentSchoolId) {
					await attachStudentToSchoolReplaceInTx(
						tx,
						authUserId,
						validatedStudentSchoolId,
					);
				}
			});
		} catch (err) {
			if (err instanceof AppError) {
				return sendJsonError(res, err.message, err.statusCode);
			}
			console.error('register: user.update failed (existingById)', err);
			return sendJsonError(
				res,
				registerDbFailureClientMessage(targetRole),
				500,
			);
		}

		if (!data.user) {
			console.error('register: missing user in signUp response');
			return sendJsonError(res, 'Registration incomplete', 500);
		}

		return completeRegisterSuccessResponse(
			res,
			targetRole,
			authUserId,
			emailTrimmed,
			firstName,
			lastName,
			{ user: data.user, session: data.session },
		);
	}

	const existingByEmail = await prisma.user.findUnique({
		where: { email: emailTrimmed },
	});
	if (existingByEmail) {
		console.error(
			'register: email exists in app DB under different id after signUp â€” orphan Auth user possible',
			{ authUserId, existingUserId: existingByEmail.id },
		);
		return sendJsonError(res, 'Email already registered', 409);
	}

	const profileFields = registerDbProfileFromRequest(
		emailTrimmed,
		firstName,
		lastName,
		targetRole,
		phone,
	);
	const userCreateData = buildUserCreateWithRoleProfiles(
		authUserId,
		profileFields,
		targetRole,
		instructorLicenseTrimmed,
	);

	try {
		await prisma.$transaction(async (tx) => {
			await tx.user.create({ data: userCreateData });
			if (targetRole === Role.INSTRUCTOR && validatedInstructorSchoolId) {
				await attachInstructorToSchoolWithDefaultsInTx(
					tx,
					authUserId,
					validatedInstructorSchoolId,
				);
			}
			if (targetRole === Role.STUDENT && validatedStudentSchoolId) {
				await attachStudentToSchoolReplaceInTx(
					tx,
					authUserId,
					validatedStudentSchoolId,
				);
			}
		});
	} catch (err) {
		if (err instanceof AppError) {
			return sendJsonError(res, err.message, err.statusCode);
		}
		const isUnique =
			err instanceof Prisma.PrismaClientKnownRequestError &&
			err.code === 'P2002';

		if (isUnique) {
			const row = await prisma.user.findUnique({
				where: { id: authUserId },
			});
			if (row && row.email === emailTrimmed) {
				const profileData = registerDbProfileFromRequest(
					emailTrimmed,
					firstName,
					lastName,
					targetRole,
					phone,
				);
				try {
					await prisma.$transaction(async (tx) => {
						await tx.user.update({
							where: { id: authUserId },
							data: profileData,
						});
						await ensureRoleProfilesAfterUserUpsert(
							tx,
							authUserId,
							targetRole,
							instructorLicenseTrimmed,
						);
						if (
							targetRole === Role.INSTRUCTOR &&
							validatedInstructorSchoolId
						) {
							await attachInstructorToSchoolWithDefaultsInTx(
								tx,
								authUserId,
								validatedInstructorSchoolId,
							);
						}
						if (
							targetRole === Role.STUDENT &&
							validatedStudentSchoolId
						) {
							await attachStudentToSchoolReplaceInTx(
								tx,
								authUserId,
								validatedStudentSchoolId,
							);
						}
					});
				} catch (updateErr) {
					if (updateErr instanceof AppError) {
						return sendJsonError(
							res,
							updateErr.message,
							updateErr.statusCode,
						);
					}
					console.error(
						'register: user.update failed after P2002',
						updateErr,
					);
					return sendJsonError(
						res,
						registerDbFailureClientMessage(targetRole),
						500,
					);
				}
				if (!data.user) {
					console.error('register: missing user in signUp response');
					return sendJsonError(res, 'Registration incomplete', 500);
				}

				return completeRegisterSuccessResponse(
					res,
					targetRole,
					authUserId,
					emailTrimmed,
					firstName,
					lastName,
					{ user: data.user, session: data.session },
				);
			}
		}

		console.error(
			'register: Prisma user.create failed after signUp â€” orphan auth user may exist',
			err,
		);
		return sendJsonError(
			res,
			registerDbFailureClientMessage(targetRole),
			500,
		);
	}

	if (!data.user) {
		console.error('register: missing user in signUp response');
		return sendJsonError(res, 'Registration incomplete', 500);
	}

	return completeRegisterSuccessResponse(
		res,
		targetRole,
		authUserId,
		emailTrimmed,
		firstName,
		lastName,
		{ user: data.user, session: data.session },
	);
}
