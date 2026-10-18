import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { okDataUnknown, stdBearerResponses, z } from './shared';

const schoolId = z.string().uuid();
const listQuery = z.object({
	schoolId,
	limit: z.coerce.number().int().min(1).max(100).optional(),
	cursor: z.string().max(2048).optional(),
	search: z.string().max(120).optional(),
	view: z
		.enum([
			'all',
			'failed-logins',
			'suspicious',
			'access-denied',
			'account-changes',
		])
		.optional(),
	filters: z.string().max(4096).optional().openapi({
		description:
			'JSON: {"rules":[{"field":"type","operator":"is","value":"LOGIN_FAILED"}]}; reguły są łączone przez AND.',
	}),
});

export function registerSecurityLogPaths(registry: OpenAPIRegistry): void {
	registry.registerPath({
		method: 'get',
		path: '/manager/security-logs',
		tags: ['Manager'],
		summary: 'Dziennik bezpieczeństwa OSK (tylko MANAGER)',
		security: [{ bearerAuth: [] }],
		request: { query: listQuery },
		responses: stdBearerResponses({
			200: okDataUnknown('Lista zdarzeń z pageInfo i collectionStatus'),
		}),
	});
	registry.registerPath({
		method: 'get',
		path: '/manager/security-logs/filter-options',
		tags: ['Manager'],
		summary: 'Widoczni użytkownicy do filtrów dziennika',
		security: [{ bearerAuth: [] }],
		request: {
			query: z.object({
				schoolId,
				kind: z.enum(['actor', 'target']).optional(),
				search: z.string().max(120).optional(),
				limit: z.coerce.number().int().min(1).max(50).optional(),
				cursor: z.string().optional(),
			}),
		},
		responses: stdBearerResponses({
			200: okDataUnknown('Opcje użytkowników'),
		}),
	});
	registry.registerPath({
		method: 'get',
		path: '/manager/security-logs/{eventId}',
		tags: ['Manager'],
		summary: 'Szczegóły zdarzenia widocznego w OSK',
		security: [{ bearerAuth: [] }],
		request: {
			params: z.object({ eventId: z.string().uuid() }),
			query: z.object({ schoolId }),
		},
		responses: stdBearerResponses({
			200: okDataUnknown('Szczegóły zdarzenia'),
		}),
	});
}
