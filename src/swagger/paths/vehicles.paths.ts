import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import {
	okDataSchema,
	okDataUnknown,
	stdBearerResponses,
	vehicleAvailabilityStatusSchema,
	vehicleDataSchema,
	vehicleIdParamsSchema,
	vehicleListQuerySchema,
	z,
} from './shared';

export function registerVehiclePaths(registry: OpenAPIRegistry): void {
	const categories = z
		.array(z.string().uuid())
		.min(1)
		.describe(
			'Dokładne kategorie CourseType; brak dziedziczenia. Pusta lista i null są niedozwolone.',
		);
	const writeFields = z
		.object({
			name: z.string(),
			registrationNumber: z.string(),
			supportedCourseTypeIds: categories.optional(),
		})
		.passthrough();
	// ── Vehicles ─────────────────────────────────────────────────────────────
	registry.registerPath({
		method: 'get',
		path: '/vehicles',
		tags: ['Vehicles'],
		summary:
			'Lista pojazdów dla OSK (MANAGER); courseId ogranicza do aktywnych pojazdów zgodnej kategorii, startTime+endTime wyklucza zajęte',
		security: [{ bearerAuth: [] }],
		request: { query: vehicleListQuerySchema },
		responses: stdBearerResponses({
			200: okDataSchema(
				'Lista pojazdów',
				z.object({
					vehicles: z.array(vehicleDataSchema),
					defaultVehicleId: z.string().uuid().nullable(),
				}),
			),
		}),
	});

	registry.registerPath({
		method: 'get',
		path: '/vehicles/{id}',
		tags: ['Vehicles'],
		summary: 'Szczegóły pojazdu (MANAGER)',
		security: [{ bearerAuth: [] }],
		request: { params: vehicleIdParamsSchema },
		responses: stdBearerResponses({
			200: okDataSchema('Pojazd', vehicleDataSchema),
		}),
	});

	registry.registerPath({
		method: 'post',
		path: '/vehicles',
		tags: ['Vehicles'],
		summary: 'Utworzenie / aktualizacja pojazdu (upsert — MANAGER)',
		security: [{ bearerAuth: [] }],
		request: {
			body: {
				content: {
					'application/json': {
						schema: z.union([
							writeFields.extend({
								schoolId: z.string().uuid(),
								supportedCourseTypeIds: categories,
							}),
							writeFields.extend({ id: z.string().uuid() }),
						]),
					},
				},
			},
		},
		responses: stdBearerResponses({
			200: okDataSchema(
				'Pojazd + status HTTP z serwisu',
				vehicleDataSchema,
			),
		}),
	});

	registry.registerPath({
		method: 'post',
		path: '/vehicles/{id}/photo',
		tags: ['Vehicles'],
		summary: 'Zdjęcie pojazdu (multipart, pole file)',
		security: [{ bearerAuth: [] }],
		request: { params: vehicleIdParamsSchema },
		responses: stdBearerResponses({
			200: okDataSchema(
				'OK',
				z.object({
					photoUrl: z.string().nullable(),
					updatedAt: z.string().datetime().nullable(),
				}),
			),
		}),
	});

	registry.registerPath({
		method: 'patch',
		path: '/vehicles/{id}/status',
		tags: ['Vehicles'],
		summary: 'Zmiana statusu pojazdu ACTIVE / UNAVAILABLE (MANAGER)',
		security: [{ bearerAuth: [] }],
		request: {
			params: vehicleIdParamsSchema,
			body: {
				content: {
					'application/json': {
						schema: vehicleAvailabilityStatusSchema,
					},
				},
			},
		},
		responses: stdBearerResponses({
			200: okDataSchema('Zaktualizowany pojazd', vehicleDataSchema),
		}),
	});

	registry.registerPath({
		method: 'patch',
		path: '/vehicles/{id}',
		tags: ['Vehicles'],
		summary: 'Częściowa aktualizacja pojazdu (MANAGER)',
		security: [{ bearerAuth: [] }],
		request: {
			params: vehicleIdParamsSchema,
			body: {
				content: {
					'application/json': {
						schema: writeFields.describe(
							'Pominięcie supportedCourseTypeIds zachowuje kategorie. Usunięcie kategorii używanej przez trwającą/zaplanowaną jazdę zwraca 409.',
						),
					},
				},
			},
		},
		responses: stdBearerResponses({
			200: okDataSchema('OK', vehicleDataSchema),
		}),
	});

	registry.registerPath({
		method: 'delete',
		path: '/vehicles/{id}',
		tags: ['Vehicles'],
		summary: 'Usunięcie pojazdu (MANAGER)',
		security: [{ bearerAuth: [] }],
		request: { params: vehicleIdParamsSchema },
		responses: stdBearerResponses({
			200: okDataUnknown('OK'),
		}),
	});
}
