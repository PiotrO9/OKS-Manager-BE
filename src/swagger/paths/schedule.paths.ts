import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import {
	okDataUnknown,
	scheduleMeQuerySchema,
	scheduleQuerySchema,
	stdBearerResponses,
} from './shared';

export function registerSchedulePaths(registry: OpenAPIRegistry): void {
	registry.registerPath({
		method: 'get',
		path: '/schedule/me',
		tags: ['Schedule'],
		summary: 'Harmonogram bieżącego użytkownika',
		security: [{ bearerAuth: [] }],
		request: { query: scheduleMeQuerySchema },
		responses: stdBearerResponses({
			200: okDataUnknown('Harmonogram bieżącego użytkownika'),
		}),
	});

	registry.registerPath({
		method: 'get',
		path: '/schedule',
		tags: ['Schedule'],
		summary: 'Harmonogram managera dla instruktora albo kursanta',
		security: [{ bearerAuth: [] }],
		request: { query: scheduleQuerySchema },
		responses: stdBearerResponses({
			200: okDataUnknown('Harmonogram dla wskazanego filtra'),
		}),
	});
}
