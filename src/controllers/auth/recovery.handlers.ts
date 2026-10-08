import { Request, Response } from 'express';
import { z } from 'zod';
import { sendJsonError, sendJsonSuccess } from '../../lib/apiResponse';
import { revokeAccountSessions } from '../../lib/accountSessions';
import { getPrisma } from '../../lib/prisma';
import { getSupabaseClient } from '../../lib/supabase';
import { parseRequestPart } from '../requestParsing';

const requestSchema = z.object({ email: z.string().trim().email().max(320) });
const completeSchema = z.object({
	accessToken: z.string().min(1),
	refreshToken: z.string().min(1),
	password: z.string().min(8).max(128),
});

function resetRedirect(): string {
	const frontendUrl = process.env.FRONTEND_URL?.split(',')[0]?.trim();
	if (!frontendUrl)
		throw new Error('FRONTEND_URL is required for password reset');
	return new URL('/reset-password', frontendUrl).toString();
}

export async function requestPasswordRecovery(req: Request, res: Response) {
	const { email } = parseRequestPart(requestSchema, req.body, 'body');
	const redirectTo = resetRedirect();
	try {
		const { error } = await getSupabaseClient().auth.resetPasswordForEmail(
			email,
			{ redirectTo },
		);
		if (error) {
			return sendJsonError(
				res,
				'Password reset email could not be sent',
				502,
			);
		}
	} catch {
		return sendJsonError(
			res,
			'Password reset email could not be sent',
			502,
		);
	}
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
		return sendJsonError(res, 'Invalid password recovery session', 401);
	}
	const { error } = await supabase.auth.updateUser({ password });
	if (error) return sendJsonError(res, error.message, 400);
	await revokeAccountSessions(claims.sub);
	await supabase.auth.signOut({ scope: 'local' });
	return sendJsonSuccess(res, { changed: true });
}
