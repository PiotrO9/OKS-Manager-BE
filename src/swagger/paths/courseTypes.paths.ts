import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { okDataUnknown, stdBearerResponses } from './shared';

export function registerCourseTypePaths(registry: OpenAPIRegistry): void {
	// ── Course types ─────────────────────────────────────────────────────────
	registry.registerPath({
		method: 'get',
		path: '/course-types',
		tags: ['Course types'],
		summary: 'Typy kursów (MANAGER)',
		security: [{ bearerAuth: [] }],
		responses: stdBearerResponses({
			200: okDataUnknown('Lista typów'),
		}),
	});
}
