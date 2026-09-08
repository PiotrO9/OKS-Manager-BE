import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

type Endpoint = {
	method: string;
	path: string;
};

const REPO_ROOT = process.cwd();
const BASELINE_PATH = join(REPO_ROOT, 'docs', 'BACKEND_ENDPOINT_BASELINE.md');
const ROUTES_DIR = join(REPO_ROOT, 'src', 'routes');

const ROUTE_MOUNTS: Array<{ file: string; mountPath: string }> = [
	{ file: 'auth.routes.ts', mountPath: '/auth' },
	{ file: 'driving-schools.routes.ts', mountPath: '/driving-schools' },
	{ file: 'instructors.routes.ts', mountPath: '/instructors' },
	{
		file: 'instructor-availability.routes.ts',
		mountPath: '/instructors/:instructorId/availability',
	},
	{ file: 'students.routes.ts', mountPath: '/students' },
	{ file: 'vehicles.routes.ts', mountPath: '/vehicles' },
	{ file: 'courses.routes.ts', mountPath: '/courses' },
	{ file: 'course-types.routes.ts', mountPath: '/course-types' },
	{ file: 'events.routes.ts', mountPath: '/events' },
	{ file: 'lessons.routes.ts', mountPath: '/lessons' },
	{ file: 'lesson-ratings.routes.ts', mountPath: '/ratings' },
	{ file: 'manager-attention.routes.ts', mountPath: '/manager' },
	{ file: 'me.routes.ts', mountPath: '/me' },
	{ file: 'schedule.routes.ts', mountPath: '/schedule' },
	{ file: 'dev.routes.ts', mountPath: '/dev' },
];

const TECHNICAL_ENDPOINTS: Endpoint[] = [
	{ method: 'GET', path: '/health' },
	{ method: 'GET', path: '/test' },
	{ method: 'GET', path: '/openapi.json' },
	{ method: 'USE', path: '/api-docs' },
];

function endpointKey(endpoint: Endpoint): string {
	return `${endpoint.method} ${endpoint.path}`;
}

function normalizePath(path: string): string {
	const normalized = path.replace(/\/+/g, '/');
	if (normalized.length > 1 && normalized.endsWith('/')) {
		return normalized.slice(0, -1);
	}
	return normalized;
}

function joinPaths(prefix: string, suffix: string): string {
	return normalizePath(`${prefix}/${suffix}`);
}

function sortedEndpointKeys(endpoints: Endpoint[]): string[] {
	return endpoints.map(endpointKey).sort((a, b) => a.localeCompare(b));
}

function uniqueEndpoints(endpoints: Endpoint[]): Endpoint[] {
	const byKey = new Map<string, Endpoint>();
	for (const endpoint of endpoints) {
		byKey.set(endpointKey(endpoint), endpoint);
	}
	return [...byKey.values()];
}

function extractBaselineEndpoints(): Endpoint[] {
	const markdown = readFileSync(BASELINE_PATH, 'utf8');
	const endpointRows =
		/^\| (GET|POST|PATCH|PUT|DELETE|USE) \| `([^`]+)` \|/gm;
	const endpoints: Endpoint[] = [];
	let match: RegExpExecArray | null;

	while ((match = endpointRows.exec(markdown)) !== null) {
		endpoints.push({
			method: match[1],
			path: normalizePath(match[2]),
		});
	}

	return uniqueEndpoints(endpoints);
}

function extractRouterEndpoints(): Endpoint[] {
	const endpoints: Endpoint[] = [...TECHNICAL_ENDPOINTS];
	const routeCall =
		/router\.(get|post|patch|put|delete)\(\s*['"`]([^'"`]+)['"`]/g;

	for (const { file, mountPath } of ROUTE_MOUNTS) {
		const source = readFileSync(join(ROUTES_DIR, file), 'utf8');
		let match: RegExpExecArray | null;

		while ((match = routeCall.exec(source)) !== null) {
			endpoints.push({
				method: match[1].toUpperCase(),
				path: joinPaths(mountPath, match[2]),
			});
		}
	}

	return uniqueEndpoints(endpoints);
}

describe('backend endpoint baseline', () => {
	it('matches current Express routing surface', () => {
		const baseline = sortedEndpointKeys(extractBaselineEndpoints());
		const currentRoutes = sortedEndpointKeys(extractRouterEndpoints());

		expect(currentRoutes).toEqual(baseline);
	});
});
