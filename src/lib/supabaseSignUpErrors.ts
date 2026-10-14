/**
 * Mapuje błąd tworzenia użytkownika w Supabase Auth na bezpieczny kod i komunikat.
 * Pełny obiekt błędu logowany jest przez wywołującego.
 */

import { logger } from './logger';

const DUPLICATE_EMAIL_SUBSTRINGS = [
	'already registered',
	'already been registered',
	'user already exists',
	'email address is already registered',
	'email already',
] as const;

type SignUpErrorLike = {
	message: string;
	status?: number;
	code?: string;
};

function mapAuthSignUpErrorForClient(error: SignUpErrorLike): {
	statusCode: 400 | 429 | 500;
	clientMessage: string;
} {
	const normalized = error.message.toLowerCase();
	const looksLikeDuplicate =
		error.code === 'user_already_exists' ||
		DUPLICATE_EMAIL_SUBSTRINGS.some((fragment) =>
			normalized.includes(fragment),
		);

	if (looksLikeDuplicate) {
		return { statusCode: 400, clientMessage: 'Email already exists' };
	}
	if (
		error.code === 'email_address_invalid' ||
		(error.status === 400 && normalized.includes('email') && normalized.includes('invalid'))
	) {
		return { statusCode: 400, clientMessage: 'Invalid email address' };
	}
	if (error.status === 429) {
		return {
			statusCode: 429,
			clientMessage: 'Too many registration requests. Try again later.',
		};
	}
	if (error.status === 400) {
		return { statusCode: 400, clientMessage: 'Invalid registration data' };
	}

	return { statusCode: 500, clientMessage: 'Failed to create user' };
}

function logAuthSignUpError(error: SignUpErrorLike): void {
	logger.error('register: supabase createUser error', {
		message: error.message,
		code: error.code,
		status: error.status,
	});
}

export { logAuthSignUpError, mapAuthSignUpErrorForClient };
export type { SignUpErrorLike };
