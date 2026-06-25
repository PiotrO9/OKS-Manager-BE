import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import {
	z,
	loginBodySchema,
	registerBodySchema,
	authMeUserSchema,
	accessTokenDataSchema,
	authLoginDataSchema,
	instructorEventDtoSchema,
	lessonDtoSchema,
	lessonRatingDtoSchema,
	vehicleDataSchema,
	okDataUnknown,
	okDataSchema,
	clientError,
	stdBearerResponses,
	instructorAdminPatchBodySchema,
	assignInstructorToSchoolBodySchema,
	assignStudentDrivingSchoolBodySchema,
	assignStudentToCourseBodySchema,
	courseIdParamsSchema,
	eventIdAndStudentUserParamsSchema,
	eventIdParamsSchema,
	lessonIdParamsSchema,
	drivingSchoolIdParamsSchema,
	instructorIdParamsSchema,
	listStudentsQuerySchema,
	patchCourseParticipantStatusBodySchema,
	patchStudentBodySchema,
	patchStudentPkkBodySchema,
	schoolIdQuerySchema,
	studentCourseParamsSchema,
	studentDetailParamsSchema,
	studentDetailQuerySchema,
	studentEventsQuerySchema,
	studentPaymentsQuerySchema,
	studentProcessStatusQuerySchema,
	studentUserIdParamsSchema,
	uuidSchema,
	createCourseBodySchema,
	patchCourseBodySchema,
	assignStudentsBodySchema,
	createInstructorEventBodySchema,
	eligibleStudentsQuerySchema,
	getEventQuerySchema,
	patchInstructorEventBodySchema,
	replaceEventStudentsBodySchema,
	bookLessonBodySchema,
	bookOwnLessonBodySchema,
	cancelLessonBodySchema,
	createLessonRatingBodySchema,
	lessonRatingParamsSchema,
	instructorLessonRatingsQuerySchema,
	listLessonRatingsQuerySchema,
	createDrivingSchoolBodySchema,
	setDefaultVehicleBodySchema,
	updateDrivingSchoolBodySchema,
	schoolAvailabilitySlotsQuerySchema,
	availabilityInstructorIdParamsSchema,
	computeQuerySchema,
	dayOfWeekParamsSchema,
	exceptionDateParamsSchema,
	exceptionsQuerySchema,
	putExceptionBodySchema,
	putWeeklyBodySchema,
	slotsQuerySchema,
	vehicleAvailabilityStatusSchema,
	vehicleIdParamsSchema,
	vehicleListQuerySchema
} from './shared';

export function registerVehiclePaths(registry: OpenAPIRegistry): void {
	// ── Vehicles ─────────────────────────────────────────────────────────────
	registry.registerPath({
		method: 'get',
		path: '/vehicles',
		tags: ['Vehicles'],
		summary:
			'Lista pojazdów dla OSK (MANAGER); opcjonalnie startTime+endTime (ISO) — bez pojazdów zajętych w tym oknie',
		security: [{ bearerAuth: [] }],
		request: { query: vehicleListQuerySchema },
		responses: stdBearerResponses({
			200: okDataUnknown('Lista pojazdów'),
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
						schema: z
							.record(z.unknown())
							.describe(
								'Patrz vehicleService.upsertVehicleForUser',
							),
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
			200: okDataSchema('OK', vehicleDataSchema),
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
						schema: z
							.record(z.unknown())
							.describe(
								'Patrz vehicleService.updateVehicleForUser',
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
