import { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { sendJsonError } from '../../lib/apiResponse';
import { AppError } from '../../lib/http/AppError';
import { logger } from '../../lib/logger';
import {
	actorSchoolScopes,
	recordRequestSecurityEvent,
	verifiedSchoolScope,
} from '../../lib/securityEventContext';
import { canInvokerRegisterUserWithRole } from '../../lib/registerRolePolicy';
import { getSupabaseAdminClient } from '../../lib/supabaseAdmin';
import { parseInstructorBirthDate } from '../../lib/validation/instructorBirthDate';
import {
	logAuthSignUpError,
	mapAuthSignUpErrorForClient,
} from '../../lib/supabaseSignUpErrors';
import { persistRegisteredUser } from './register.persistence';
import { resolveRegistrationSchoolIds } from './register.school';
import {
	completeRegisterSuccessResponse,
	instructorLicenseFromRegisterBody,
	parseRegistrationTargetRole,
	REGISTRATION_TARGET_ROLES,
} from './register.helpers';
import type { RegisterBody, RequestWithUser } from './types';

async function sendAppError(
	req: Request,
	res: Response,
	err: unknown,
): Promise<Response | null> {
	if (err instanceof AppError) {
		if (err.statusCode === 403) {
			await recordRequestSecurityEvent(req, {
				type: 'ACCESS_DENIED',
				actorUserId: req.user?.id,
				actorRole: req.user?.role,
				reasonCode:
					err.securityAudit?.reasonCode ??
					'REGISTRATION_SCOPE_DENIED',
				eventPhase: 'access_decision',
				httpStatus: 403,
				schoolScopes: await actorSchoolScopes(req),
			});
		}
		return sendJsonError(res, err.message, err.statusCode);
	}
	return null;
}

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
		await recordRequestSecurityEvent(req, {
			type: 'ACCESS_DENIED',
			actorUserId: actor.id,
			actorRole: actor.role,
			actorDisplayName: `${actor.firstName} ${actor.lastName}`.trim(),
			reasonCode: 'ROLE_CANNOT_REGISTER_TARGET',
			eventPhase: 'access_decision',
			httpStatus: 403,
			schoolScopes: await actorSchoolScopes(req),
		});
		return sendJsonError(res, 'Forbidden', 403);
	}

	const emailTrimmed = String(email).trim();
	let instructorBirthDate: Date | null = null;

	let registrationSchoolIds: Awaited<
		ReturnType<typeof resolveRegistrationSchoolIds>
	>;
	try {
		if (targetRole === Role.INSTRUCTOR) {
			instructorBirthDate = parseInstructorBirthDate(body.birthDate);
		}
		registrationSchoolIds = await resolveRegistrationSchoolIds(
			actor,
			body,
			targetRole,
			emailTrimmed,
		);
	} catch (err) {
		const appErrorResponse = await sendAppError(req, res, err);
		if (appErrorResponse) {
			return appErrorResponse;
		}
		throw err;
	}

	const { data, error } =
		await getSupabaseAdminClient().auth.admin.createUser({
			email: emailTrimmed,
			password,
			email_confirm: true,
		});

	if (error) {
		logAuthSignUpError(error);
		const mapped = mapAuthSignUpErrorForClient(error);
		return sendJsonError(res, mapped.clientMessage, mapped.statusCode);
	}

	const authUserId = data.user?.id;
	if (!authUserId) {
		logger.error('register: createUser succeeded but no user id returned', {
			requestId: req.requestId,
		});
		return sendJsonError(res, 'Registration incomplete', 500);
	}

	try {
		await persistRegisteredUser({
			authUserId,
			emailTrimmed,
			firstName,
			lastName,
			targetRole,
			phone,
			instructorLicenseTrimmed,
			instructorBirthDate,
			...registrationSchoolIds,
		});
	} catch (err) {
		const appErrorResponse = await sendAppError(req, res, err);
		if (appErrorResponse) {
			return appErrorResponse;
		}
		throw err;
	}

	if (!data.user) {
		logger.error('register: missing user in createUser response', {
			requestId: req.requestId,
		});
		return sendJsonError(res, 'Registration incomplete', 500);
	}
	const schoolId =
		registrationSchoolIds.validatedStudentSchoolId ??
		registrationSchoolIds.validatedInstructorSchoolId;
	await recordRequestSecurityEvent(req, {
		type: 'ACCOUNT_CREATED',
		actorUserId: actor.id,
		actorRole: actor.role,
		actorDisplayName: `${actor.firstName} ${actor.lastName}`.trim(),
		targetUserId: authUserId,
		targetDisplayName: `${firstName} ${lastName}`.trim(),
		eventPhase: 'account_created',
		httpStatus: targetRole === Role.INSTRUCTOR ? 201 : 200,
		schoolScopes: schoolId
			? await verifiedSchoolScope(req, schoolId, {
					userId: authUserId,
					displayName: `${firstName} ${lastName}`.trim(),
				})
			: [],
	});

	return completeRegisterSuccessResponse(
		res,
		targetRole,
		authUserId,
		emailTrimmed,
		firstName,
		lastName,
		{ user: data.user, session: null },
	);
}
