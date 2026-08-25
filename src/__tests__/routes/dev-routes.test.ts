import { describe, expect, it, afterEach } from 'vitest';
import { AppError } from '../../lib/http/AppError';
import { requireResetAndSeedEnabled } from '../../routes/dev.routes';

describe('requireResetAndSeedEnabled', () => {
	const originalAllowDbReset = process.env.ALLOW_DB_RESET;

	afterEach(() => {
		if (originalAllowDbReset === undefined) {
			delete process.env.ALLOW_DB_RESET;
		} else {
			process.env.ALLOW_DB_RESET = originalAllowDbReset;
		}
	});

	it('allows reset when ALLOW_DB_RESET is true', () => {
		process.env.ALLOW_DB_RESET = 'true';

		expect(() => requireResetAndSeedEnabled()).not.toThrow();
	});

	it('rejects reset when ALLOW_DB_RESET is not true', () => {
		process.env.ALLOW_DB_RESET = 'false';

		expect(() => requireResetAndSeedEnabled()).toThrow(AppError);
		expect(() => requireResetAndSeedEnabled()).toThrow(
			'Database reset is disabled',
		);
	});
});
