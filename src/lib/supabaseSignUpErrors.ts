/**
 * Mapuje błąd z `auth.signUp` na kod HTTP i komunikat dla klienta (bez surowego message).
 * Pełny obiekt błędu logowany jest przez wywołującego.
 */

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
	statusCode: 400 | 500;
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

	return { statusCode: 500, clientMessage: 'Failed to create user' };
}

function logAuthSignUpError(error: SignUpErrorLike): void {
	console.error('register: supabase signUp error', {
		message: error.message,
		code: error.code,
		status: error.status,
	});
}

export { logAuthSignUpError, mapAuthSignUpErrorForClient };
export type { SignUpErrorLike };
