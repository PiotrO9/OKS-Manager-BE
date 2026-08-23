import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { z } from './shared';

export function registerHealthPaths(registry: OpenAPIRegistry): void {
	registry.registerPath({
		method: 'get',
		path: '/test',
		tags: ['Health'],
		summary: 'Test połączenia',
		responses: {
			200: {
				description: 'OK',
				content: {
					'application/json': {
						schema: z.object({
							success: z.literal(true),
							data: z.object({
								message: z.string(),
							}),
						}),
					},
				},
			},
		},
	});
}
