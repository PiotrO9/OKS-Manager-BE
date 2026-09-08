import { describe, expect, it } from 'vitest';
import { sanitizeLogValue } from '../../lib/logger';

describe('sanitizeLogValue', () => {
	it('redacts sensitive fields recursively', () => {
		const sanitized = sanitizeLogValue({
			authorization: 'Bearer access-token',
			nested: {
				password: 'secret',
				refresh_token: 'refresh-token',
				safe: 'visible',
			},
			items: [{ cookie: 'session=value' }],
		});

		expect(sanitized).toEqual({
			authorization: '[REDACTED]',
			nested: {
				password: '[REDACTED]',
				refresh_token: '[REDACTED]',
				safe: 'visible',
			},
			items: [{ cookie: '[REDACTED]' }],
		});
	});

	it('serializes Error objects without losing message details', () => {
		const sanitized = sanitizeLogValue(new Error('database failed'));

		expect(sanitized).toMatchObject({
			name: 'Error',
			message: 'database failed',
		});
	});
});
