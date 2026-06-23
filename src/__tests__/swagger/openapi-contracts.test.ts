import { describe, expect, it } from 'vitest';
import { getOpenApiSpec } from '../../swagger/openapiSpec';

function jsonSchemaFor(
	spec: Record<string, unknown>,
	path: string,
	method: string,
	status: string,
): Record<string, unknown> {
	const paths = spec.paths as Record<string, unknown>;
	const pathItem = paths[path] as Record<string, unknown>;
	const operation = pathItem[method] as Record<string, unknown>;
	const responses = operation.responses as Record<string, unknown>;
	const response = responses[status] as Record<string, unknown>;
	const content = response.content as Record<string, unknown>;
	const json = content['application/json'] as Record<string, unknown>;

	return json.schema as Record<string, unknown>;
}

describe('OpenAPI critical response contracts', () => {
	it('describes auth refresh access token response', () => {
		const spec = getOpenApiSpec();
		const schema = jsonSchemaFor(spec, '/auth/refresh', 'post', '200');
		const properties = schema.properties as Record<string, unknown>;
		const data = properties.data as { properties?: Record<string, unknown> };

		expect(data.properties).toHaveProperty('access_token');
	});

	it('describes event detail response data.event', () => {
		const spec = getOpenApiSpec();
		const schema = jsonSchemaFor(spec, '/events/{id}', 'get', '200');
		const properties = schema.properties as Record<string, unknown>;
		const data = properties.data as { properties?: Record<string, unknown> };

		expect(data.properties).toHaveProperty('event');
	});

	it('describes lesson detail response data.lesson', () => {
		const spec = getOpenApiSpec();
		const schema = jsonSchemaFor(spec, '/lessons/{id}', 'get', '200');
		const properties = schema.properties as Record<string, unknown>;
		const data = properties.data as { properties?: Record<string, unknown> };

		expect(data.properties).toHaveProperty('lesson');
	});
});
