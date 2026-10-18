import { Request, Response } from 'express';
import { z } from 'zod';
import { sendJsonError, sendJsonSuccess } from '../../lib/apiResponse';
import { revokeAccountSessions } from '../../lib/accountSessions';
import { logger } from '../../lib/logger';
import { getPrisma } from '../../lib/prisma';
import { recordRequestSecurityEvent } from '../../lib/securityEventContext';
import { getSupabaseClient } from '../../lib/supabase';
import { passwordResetRedirect } from '../../lib/passwordResetRedirect';
import { resolveLoginTarget } from '../../services/security-events/record';
import { parseRequestPart } from '../requestParsing';

const requestSchema = z.object({ email: z.string().trim().email().max(320) });
const completeSchema = z.object({
	accessToken: z.string().min(1),
	refreshToken: z.string().min(1),
	password: z.string().min(8).max(128),
});

async function recoveryTarget(email: string) {
	try {
		return await resolveLoginTarget(email);
	} catch (error) {
		logger.error('Recovery target could not be resolved for audit', {
			error,
		});
		return { schoolScopes: [] };
	}
}

export async function requestPasswordRecovery(req: Request, res: Response) {
	const { email } = parseRequestPart(requestSchema, req.body, 'body');
	const redirectTo = passwordResetRedirect();
	try {
		const { error } = await getSupabaseClient().auth.resetPasswordForEmail(
			email,
			{ redirectTo },
		);
		if (error) {
			const target = await recoveryTarget(email);
			await recordRequestSecurityEvent(req, {
				type: 'PASSWORD_RESET_FAILED',
				reasonCode: error.code ?? 'AUTH_PROVIDER_ERROR',
				loginIdentifier: email,
				targetUserId: target.targetUserId,
				targetDisplayName: target.targetDisplayName,
				schoolScopes: target.schoolScopes,
				httpStatus: 502,
			});
			return sendJsonError(
				res,
				'Password reset email could not be sent',
				502,
			);
		}
	} catch {
		const target = await recoveryTarget(email);
		await recordRequestSecurityEvent(req, {
			type: 'PASSWORD_RESET_FAILED',
			reasonCode: 'AUTH_PROVIDER_EXCEPTION',
			loginIdentifier: email,
			targetUserId: target.targetUserId,
			targetDisplayName: target.targetDisplayName,
			schoolScopes: target.schoolScopes,
			httpStatus: 502,
		});
		return sendJsonError(
			res,
			'Password reset email could not be sent',
			502,
		);
	}
	const target = await recoveryTarget(email);
	await recordRequestSecurityEvent(req, {
		type: 'PASSWORD_RESET_REQUESTED',
		loginIdentifier: email,
		targetUserId: target.targetUserId,
		targetDisplayName: target.targetDisplayName,
		schoolScopes: target.schoolScopes,
		httpStatus: 200,
	});
	return sendJsonSuccess(res, { sent: true });
}

export async function completePasswordRecovery(req: Request, res: Response) {
	const { accessToken, refreshToken, password } = parseRequestPart(
		completeSchema,
		req.body,
		'body',
	);
	const supabase = getSupabaseClient();
	const { data: claimsData, error: claimsError } =
		await supabase.auth.getClaims(accessToken);
	const claims = claimsData?.claims;
	const amr = claims?.amr;
	// Supabase oznacza sesję z linku recovery metodą AMR `otp`.
	// Typ `recovery` występuje podczas weryfikacji linku, nie w JWT.
	const emailOtpMethod =
		Array.isArray(amr) &&
		amr.some((entry) => {
			if (typeof entry === 'string') return entry === 'otp';
			return (
				typeof entry === 'object' &&
				entry !== null &&
				'method' in entry &&
				entry.method === 'otp'
			);
		});
	if (claimsError || !claims?.sub || !emailOtpMethod) {
		await recordRequestSecurityEvent(req, {
			type: 'PASSWORD_RESET_FAILED',
			reasonCode: 'INVALID_RECOVERY_SESSION',
			httpStatus: 401,
		});
		return sendJsonError(res, 'Invalid password recovery session', 401);
	}
	const user = await getPrisma().user.findUnique({
		where: { id: claims.sub },
		select: { email: true, isActive: true, deletedAt: true },
	});
	if (
		!user?.isActive ||
		user.deletedAt ||
		user.email.toLowerCase() !== String(claims.email ?? '').toLowerCase()
	) {
		await recordRequestSecurityEvent(req, {
			type: 'PASSWORD_RESET_FAILED',
			reasonCode: 'RECOVERY_ACCOUNT_UNAVAILABLE',
			targetUserId: claims.sub,
			httpStatus: 403,
		});
		return sendJsonError(
			res,
			'Recovery is not available for this account',
			403,
		);
	}
	const { data: sessionData, error: sessionError } =
		await supabase.auth.setSession({
			access_token: accessToken,
			refresh_token: refreshToken,
		});
	if (sessionError || sessionData.user?.id !== claims.sub) {
		await recordRequestSecurityEvent(req, {
			type: 'PASSWORD_RESET_FAILED',
			reasonCode: sessionError?.code ?? 'INVALID_RECOVERY_SESSION',
			targetUserId: claims.sub,
			httpStatus: 401,
		});
		return sendJsonError(res, 'Invalid password recovery session', 401);
	}
	const target = await recoveryTarget(user.email);
	const authenticatedScopes = target.schoolScopes.map((scope) => ({
		...scope,
		actorVisibility: 'KNOWN' as const,
		actorUserId: claims.sub,
		actorDisplayName: target.targetDisplayName,
	}));
	await recordRequestSecurityEvent(req, {
		type: 'PASSWORD_CHANGE_STARTED',
		actorUserId: claims.sub,
		targetUserId: claims.sub,
		targetDisplayName: target.targetDisplayName,
		schoolScopes: authenticatedScopes,
		eventPhase: 'password_change_started',
	});
	const { error } = await supabase.auth.updateUser({ password });
	if (error) {
		await recordRequestSecurityEvent(req, {
			type: 'PASSWORD_RESET_FAILED',
			reasonCode: error.code ?? 'AUTH_PROVIDER_ERROR',
			actorUserId: claims.sub,
			targetUserId: claims.sub,
			targetDisplayName: target.targetDisplayName,
			schoolScopes: authenticatedScopes,
			eventPhase: 'password_change_result',
			httpStatus: 400,
		});
		return sendJsonError(res, error.message, 400);
	}
	try {
		await revokeAccountSessions(claims.sub);
	} catch (cause) {
		await recordRequestSecurityEvent(req, {
			type: 'PASSWORD_CHANGE_REPAIR_REQUIRED',
			reasonCode: 'LOCAL_SESSION_REVOCATION_FAILED',
			actorUserId: claims.sub,
			targetUserId: claims.sub,
			targetDisplayName: target.targetDisplayName,
			schoolScopes: authenticatedScopes,
			eventPhase: 'password_change_result',
		});
		throw cause;
	}
	await supabase.auth.signOut({ scope: 'local' });
	await recordRequestSecurityEvent(req, {
		type: 'PASSWORD_CHANGED',
		actorUserId: claims.sub,
		targetUserId: claims.sub,
		targetDisplayName: target.targetDisplayName,
		schoolScopes: authenticatedScopes,
		eventPhase: 'password_change_result',
		httpStatus: 200,
	});
	return sendJsonSuccess(res, { changed: true });
}
