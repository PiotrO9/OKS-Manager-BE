import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import {
	okDataUnknown,
	scheduleMeQuerySchema,
	scheduleQuerySchema,
	scheduleAvailabilityCheckBodySchema,
	scheduleAvailabilityOptionsBodySchema,
	stdBearerResponses,
} from './shared';

export function registerSchedulePaths(registry: OpenAPIRegistry): void {
	registry.registerPath({
		method: 'post',
		path: '/schedule/availability-check',
		tags: ['Schedule'],
		summary: 'Sprawdzenie dostępności kandydata bez zapisu',
		security: [{ bearerAuth: [] }],
		request: {
			body: {
				content: {
					'application/json': {
						schema: scheduleAvailabilityCheckBodySchema,
					},
				},
			},
		},
		responses: stdBearerResponses({
			200: okDataUnknown('Wynik sprawdzenia dostępności'),
		}),
	});

	registry.registerPath({
		method: 'post',
		path: '/schedule/availability-options',
		tags: ['Schedule'],
		summary: 'Lista dostępnych godzin rozpoczęcia i zakończenia bloku',
		security: [{ bearerAuth: [] }],
		request: {
			body: {
				content: {
					'application/json': {
						schema: scheduleAvailabilityOptionsBodySchema,
					},
				},
			},
		},
		responses: stdBearerResponses({
			200: okDataUnknown('Dostępne opcje godzin dla wybranego dnia'),
		}),
	});

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
