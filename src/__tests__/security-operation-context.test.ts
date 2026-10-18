import { describe, expect, it } from 'vitest';
import {
	lookupSecurityOperation,
	resolveSecurityOperation,
} from '../middleware/securityOperationContext';

describe('security operation catalog', () => {
	it('names a denied manager action before its route handler is selected', () => {
		expect(
			resolveSecurityOperation(
				'PATCH',
				'/manager/accounts/96623c2d-362c-4589-8c58-3c198a13e199/status',
			),
		).toEqual({
			code: 'MANAGER_ACCOUNT_STATUS_UPDATE',
			label: 'Zmiana aktywności konta',
			routeTemplate: '/manager/accounts/:userId/status',
			method: 'PATCH',
		});
	});

	it('prefers a static route to a parameter route', () => {
		expect(
			resolveSecurityOperation('GET', '/lessons/me').routeTemplate,
		).toBe('/lessons/me');
		expect(
			resolveSecurityOperation(
				'GET',
				'/manager/security-logs/filter-options',
			).code,
		).toBe('SECURITY_LOGS_FILTER_OPTIONS');
	});

	it('never persists an unknown raw path segment', () => {
		const path = '/students/private-user-id/unlisted-action';
		const operation = resolveSecurityOperation('PATCH', path);
		expect(operation.routeTemplate).not.toContain('private-user-id');
		expect(operation.routeTemplate).not.toContain('unlisted-action');
		expect(lookupSecurityOperation('PATCH', path)).toBeNull();
	});
});
