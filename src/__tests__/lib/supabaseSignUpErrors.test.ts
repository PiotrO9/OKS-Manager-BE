import { describe, expect, it } from 'vitest';
import { mapAuthSignUpErrorForClient } from '../../lib/supabaseSignUpErrors';

const DUPLICATE_EMAIL_SUBSTRINGS = [
	'already registered',
	'already been registered',
	'user already exists',
	'email address is already registered',
	'email already',
] as const;

describe('mapAuthSignUpErrorForClient — duplicate email (400)', () => {
	it('maps user_already_exists code to 400', () => {
		expect(
			mapAuthSignUpErrorForClient({
				code: 'user_already_exists',
				message: 'ignored',
			}),
		).toEqual({
			statusCode: 400,
			clientMessage: 'Email already exists',
		});
	});

	it.each(DUPLICATE_EMAIL_SUBSTRINGS)(
		'maps message containing %s to 400',
		(fragment) => {
			expect(
				mapAuthSignUpErrorForClient({
					message: `Error: ${fragment} please retry`,
				}),
			).toEqual({
				statusCode: 400,
				clientMessage: 'Email already exists',
			});
		},
	);

	it('matches duplicate fragments case-insensitively', () => {
		expect(
			mapAuthSignUpErrorForClient({
				message: 'USER ALREADY EXISTS in database',
			}),
		).toEqual({
			statusCode: 400,
			clientMessage: 'Email already exists',
		});
	});
});

describe('mapAuthSignUpErrorForClient — other errors (500)', () => {
	it('maps unrelated messages to 500', () => {
		expect(
			mapAuthSignUpErrorForClient({
				message: 'Database connection failed',
			}),
		).toEqual({
			statusCode: 500,
			clientMessage: 'Failed to create user',
		});
	});

	it('maps empty message to 500', () => {
		expect(mapAuthSignUpErrorForClient({ message: '' })).toEqual({
			statusCode: 500,
			clientMessage: 'Failed to create user',
		});
	});

	it('maps unknown code with generic message to 500', () => {
		expect(
			mapAuthSignUpErrorForClient({
				code: 'other_code',
				message: 'something else',
			}),
		).toEqual({
			statusCode: 500,
			clientMessage: 'Failed to create user',
		});
	});
});
