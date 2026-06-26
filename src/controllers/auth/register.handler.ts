import { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { sendJsonError } from '../../lib/apiResponse';
import { AppError } from '../../lib/http/AppError';
import { canInvokerRegisterUserWithRole } from '../../lib/registerRolePolicy';
import { getSupabaseClient } from '../../lib/supabase';
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

function sendAppError(res: Response, err: unknown): Response | null {
	if (err instanceof AppError) {
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
		return sendJsonError(res, 'Forbidden', 403);
	}

	const emailTrimmed = String(email).trim();

	let registrationSchoolIds: Awaited<
		ReturnType<typeof resolveRegistrationSchoolIds>
	>;
	try {
		registrationSchoolIds = await resolveRegistrationSchoolIds(
			actor,
			body,
			targetRole,
			emailTrimmed,
		);
	} catch (err) {
		const appErrorResponse = sendAppError(res, err);
		if (appErrorResponse) {
			return appErrorResponse;
		}
		throw err;
	}

	const { data, error } = await getSupabaseClient().auth.signUp({
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

	try {
		await persistRegisteredUser({
			authUserId,
			emailTrimmed,
			firstName,
			lastName,
			targetRole,
			phone,
			instructorLicenseTrimmed,
			...registrationSchoolIds,
		});
	} catch (err) {
		const appErrorResponse = sendAppError(res, err);
		if (appErrorResponse) {
			return appErrorResponse;
		}
		throw err;
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
