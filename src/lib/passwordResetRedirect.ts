import { AppError } from './http/AppError';

/** Shared by self-service recovery and a manager's password-reset action. */
export function passwordResetRedirect(): string {
	const frontendUrl = process.env.FRONTEND_URL?.split(',')[0]?.trim();
	if (!frontendUrl) {
		throw AppError.internal('FRONTEND_URL is required for password reset');
	}

	return new URL('/ustaw-haslo', frontendUrl).toString();
}
