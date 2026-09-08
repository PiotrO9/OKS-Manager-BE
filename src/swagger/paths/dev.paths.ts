import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { clientError, okDataUnknown, stdBearerResponses } from './shared';

export function registerDevPaths(registry: OpenAPIRegistry): void {
	registry.registerPath({
		method: 'post',
		path: '/dev/reset-and-seed',
		tags: ['Dev'],
		summary: 'Reset bazy i seed danych demo',
		description:
			'Endpoint deweloperski. Wymaga Bearer tokena użytkownika ADMIN oraz ALLOW_DB_RESET=true po stronie backendu.',
		security: [{ bearerAuth: [] }],
		responses: stdBearerResponses({
			200: okDataUnknown('Database reset and demo seed completed'),
			403: clientError('Brak roli ADMIN albo ALLOW_DB_RESET !== true'),
		}),
	});
}
