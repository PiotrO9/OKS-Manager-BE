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
	it('documents the date-only instructor registration field', () => {
		const spec = getOpenApiSpec() as {
			paths: Record<
				string,
				Record<
					string,
					{
						requestBody: {
							content: Record<
								string,
								{
									schema: {
										properties: Record<string, unknown>;
									};
								}
							>;
						};
					}
				>
			>;
		};
		expect(
			spec.paths['/auth/register']!.post!.requestBody.content[
				'application/json'
			]!.schema.properties.birthDate,
		).toMatchObject({
			type: 'string',
			nullable: true,
			pattern: '^\\d{4}-\\d{2}-\\d{2}$',
		});
	});
	it('describes the optional dev seed configuration body', () => {
		const spec = getOpenApiSpec() as {
			paths: Record<string, Record<string, Record<string, unknown>>>;
		};
		const operation = spec.paths['/dev/reset-and-seed']?.post;
		const requestBody = operation?.requestBody as {
			required?: boolean;
			content?: Record<string, { schema?: Record<string, unknown> }>;
		};
		const schema = requestBody.content?.['application/json']?.schema;
		const properties = schema?.properties as Record<
			string,
			Record<string, unknown>
		>;

		expect(requestBody.required).toBe(false);
		expect(schema?.additionalProperties).toBe(false);
		expect(properties.students?.enum).toEqual(['low', 'default', 'high']);
		expect(properties.randomSeed).toMatchObject({
			type: 'string',
			minLength: 1,
			maxLength: 100,
		});
	});

	it('describes auth refresh access token response', () => {
		const spec = getOpenApiSpec();
		const schema = jsonSchemaFor(spec, '/auth/refresh', 'post', '200');
		const properties = schema.properties as Record<string, unknown>;
		const data = properties.data as {
			properties?: Record<string, unknown>;
		};

		expect(data.properties).toHaveProperty('access_token');
	});

	it('describes event detail response data.event', () => {
		const spec = getOpenApiSpec();
		const schema = jsonSchemaFor(spec, '/events/{id}', 'get', '200');
		const properties = schema.properties as Record<string, unknown>;
		const data = properties.data as {
			properties?: Record<string, unknown>;
		};

		expect(data.properties).toHaveProperty('event');
	});

	it('describes lesson detail response data.lesson', () => {
		const spec = getOpenApiSpec();
		const schema = jsonSchemaFor(spec, '/lessons/{id}', 'get', '200');
		const properties = schema.properties as Record<string, unknown>;
		const data = properties.data as {
			properties?: Record<string, unknown>;
		};

		expect(data.properties).toHaveProperty('lesson');
	});
});
