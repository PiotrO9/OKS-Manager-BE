import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { okDataUnknown, stdBearerResponses, z } from './shared';

const schoolQuery = z.object({ schoolId: z.string().uuid() });
const targetParams = z.object({ userId: z.string().uuid() });

export function registerManagerAccountsPaths(registry: OpenAPIRegistry): void {
	registry.registerPath({
		method: 'get',
		path: '/manager/accounts',
		tags: ['Manager'],
		summary: 'Konta kursantów i instruktorów w OSK managera',
		security: [{ bearerAuth: [] }],
		request: { query: schoolQuery },
		responses: stdBearerResponses({ 200: okDataUnknown('Konta') }),
	});

	const routes = [
		{
			method: 'get',
			path: '/manager/accounts/{userId}',
			summary: 'Szczegóły konta',
		},
		{
			method: 'patch',
			path: '/manager/accounts/{userId}/profile',
			summary: 'Zmiana danych podstawowych',
		},
		{
			method: 'patch',
			path: '/manager/accounts/{userId}/email',
			summary: 'Administracyjna zmiana e-maila bez potwierdzenia',
		},
		{
			method: 'post',
			path: '/manager/accounts/{userId}/email/reconcile',
			summary: 'Ponowna synchronizacja e-maila',
		},
		{
			method: 'patch',
			path: '/manager/accounts/{userId}/status',
			summary: 'Blokada lub odblokowanie konta',
		},
		{
			method: 'post',
			path: '/manager/accounts/{userId}/archive',
			summary: 'Archiwizacja konta',
		},
		{
			method: 'post',
			path: '/manager/accounts/{userId}/password-reset',
			summary: 'Wysłanie resetu hasła',
		},
	] as const;
	for (const route of routes) {
		registry.registerPath({
			method: route.method,
			path: route.path,
			tags: ['Manager'],
			summary: route.summary,
			security: [{ bearerAuth: [] }],
			request: { params: targetParams, query: schoolQuery },
			responses: stdBearerResponses({
				200: okDataUnknown('Wynik operacji na koncie'),
			}),
		});
	}
}
