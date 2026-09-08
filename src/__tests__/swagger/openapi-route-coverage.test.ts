import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { getOpenApiSpec } from '../../swagger/openapiSpec';

type Endpoint = {
	method: string;
	path: string;
};

const BASELINE_PATH = join(
	process.cwd(),
	'docs',
	'BACKEND_ENDPOINT_BASELINE.md',
);
const TECHNICAL_ENDPOINT_PATHS = new Set(['/api-docs', '/openapi.json']);

function endpointKey(endpoint: Endpoint): string {
	return `${endpoint.method.toLowerCase()} ${endpoint.path}`;
}

function baselinePathToOpenApiPath(path: string): string {
	return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function extractBaselineEndpoints(): string[] {
	const markdown = readFileSync(BASELINE_PATH, 'utf8');
	const endpointRows = /^\| (GET|POST|PATCH|PUT|DELETE) \| `([^`]+)` \|/gm;
	const endpoints: Endpoint[] = [];
	let match: RegExpExecArray | null;

	while ((match = endpointRows.exec(markdown)) !== null) {
		endpoints.push({
			method: match[1],
			path: baselinePathToOpenApiPath(match[2]),
		});
	}

	return [
		...new Set(
			endpoints
				.filter(
					(endpoint) => !TECHNICAL_ENDPOINT_PATHS.has(endpoint.path),
				)
				.map(endpointKey),
		),
	].sort((a, b) => a.localeCompare(b));
}

function extractOpenApiEndpoints(): string[] {
	const spec = getOpenApiSpec() as {
		paths?: Record<string, Record<string, unknown>>;
	};
	const endpoints: string[] = [];

	for (const [path, pathItem] of Object.entries(spec.paths ?? {})) {
		for (const method of Object.keys(pathItem)) {
			endpoints.push(endpointKey({ method, path }));
		}
	}

	return endpoints.sort((a, b) => a.localeCompare(b));
}

describe('OpenAPI route coverage', () => {
	it('documents every non-technical endpoint from the baseline', () => {
		expect(extractOpenApiEndpoints()).toEqual(extractBaselineEndpoints());
	});
});
