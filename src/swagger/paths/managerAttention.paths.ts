import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import {
	managerAttentionQuerySchema,
	okDataUnknown,
	stdBearerResponses,
} from './shared';

export function registerManagerAttentionPaths(registry: OpenAPIRegistry): void {
	registry.registerPath({
		method: 'get',
		path: '/manager/attention-items',
		tags: ['Manager'],
		summary: 'Elementy wymagające uwagi managera',
		security: [{ bearerAuth: [] }],
		request: { query: managerAttentionQuerySchema },
		responses: stdBearerResponses({
			200: okDataUnknown('Lista elementów wymagających uwagi'),
		}),
	});
}
