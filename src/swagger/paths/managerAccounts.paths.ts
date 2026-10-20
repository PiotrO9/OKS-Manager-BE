import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import { okDataUnknown, stdBearerResponses, z } from './shared';
import { managerAccountsQuerySchema } from '../../lib/validation/managerAccountSchemas';

const schoolQuery = z.object({ schoolId: z.string().uuid() });
const targetParams = z.object({ userId: z.string().uuid() });
const accountObligation = z.object({
	type: z.enum(['LESSON', 'COURSE', 'EVENT', 'PAYMENT', 'TIME_BLOCK']),
	id: z.string().uuid(),
	title: z.string(),
	startTime: z.string().datetime().nullable(),
	endTime: z.string().datetime().nullable(),
	amount: z.string().optional(),
	currency: z.string().optional(),
	status: z.string().optional(),
});

export function registerManagerAccountsPaths(registry: OpenAPIRegistry): void {
	registry.registerPath({
		method: 'get',
		path: '/manager/accounts',
		tags: ['Manager'],
		summary: 'Konta kursantów i instruktorów w OSK managera',
		security: [{ bearerAuth: [] }],
		description:
			'Podaj page, aby otrzymać stronicowaną listę. Brak page zachowuje tymczasowo pełną tablicę dla starszych klientów. Wyszukiwanie wymaga dopasowania każdego wyrazu do imienia, nazwiska lub e-maila. profileId umożliwia punktowe znalezienie konta instruktora.',
		request: { query: managerAccountsQuerySchema },
		responses: stdBearerResponses({
			200: {
				description:
					'Strona kont lub tablica zgodna ze starszym klientem',
				content: {
					'application/json': {
						schema: z.object({
							success: z.literal(true),
							data: z.union([
								z.object({
									items: z.array(
										z.object({
											id: z.string().uuid(),
											role: z.enum([
												'STUDENT',
												'INSTRUCTOR',
											]),
											firstName: z.string(),
											lastName: z.string(),
											email: z.string(),
											isActive: z.boolean(),
											deletedAt: z
												.string()
												.datetime()
												.nullable(),
										}),
									),
									total: z.number().int().nonnegative(),
									page: z.number().int().positive(),
									limit: z.number().int().min(1).max(100),
								}),
								z
									.array(z.unknown())
									.describe('Legacy: tylko żądania bez page'),
							]),
						}),
					},
				},
			},
		}),
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
			request: { params: targetParams, query: schoolQuery.partial() },
			responses: stdBearerResponses({
				200: okDataUnknown('Wynik operacji na koncie'),
			}),
		});
	}
	registry.registerPath({
		method: 'get',
		path: '/manager/accounts/{userId}/archive-obligations',
		tags: ['Manager'],
		summary: 'Zobowiązania blokujące archiwizację konta',
		security: [{ bearerAuth: [] }],
		request: { params: targetParams, query: schoolQuery.partial() },
		responses: stdBearerResponses({
			200: {
				description: 'Aktualne zobowiązania',
				content: {
					'application/json': {
						schema: z.object({
							success: z.literal(true),
							data: z.array(accountObligation),
						}),
					},
				},
			},
		}),
	});
}
