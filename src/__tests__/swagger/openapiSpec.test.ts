import { describe, expect, it } from 'vitest';
import { getOpenApiSpec } from '../../swagger/openapiSpec';

describe('getOpenApiSpec', () => {
	it('keeps representative public paths registered', () => {
		const spec = getOpenApiSpec() as {
			paths?: Record<string, Record<string, unknown>>;
		};

		expect(spec.paths?.['/auth/login']?.post).toBeDefined();
		expect(spec.paths?.['/auth/me']?.get).toBeDefined();
		expect(spec.paths?.['/vehicles/{id}/photo']?.post).toBeDefined();
		expect(
			spec.paths?.['/events/{id}/eligible-students']?.get,
		).toBeDefined();
		expect(spec.paths?.['/lessons/me']?.post).toBeDefined();
		expect(
			spec.paths?.['/instructors/{instructorId}/availability/slots']?.get,
		).toBeDefined();
	});
});
