import { afterEach, describe, expect, it, vi } from 'vitest';
import { passwordResetRedirect } from '../../lib/passwordResetRedirect';

describe('password reset redirect URL', () => {
	afterEach(() => vi.unstubAllEnvs());

	it('uses the first frontend origin and a root-relative canonical path', () => {
		vi.stubEnv(
			'FRONTEND_URL',
			' https://school.example/old-prefix ,https://preview.example',
		);
		expect(passwordResetRedirect()).toBe(
			'https://school.example/ustaw-haslo',
		);
	});

	it('fails explicitly when the frontend URL is missing', () => {
		vi.stubEnv('FRONTEND_URL', '');
		expect(passwordResetRedirect).toThrow('FRONTEND_URL is required');
	});
});
