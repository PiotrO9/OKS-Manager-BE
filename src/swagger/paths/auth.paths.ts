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

export function registerAuthPaths(registry: OpenAPIRegistry): void {
	// ── Auth (/auth) ───────────────────────────────────────────────────────
	registry.registerPath({
		method: 'post',
		path: '/auth/register',
		tags: ['Auth'],
		summary: 'Rejestracja (wymaga Bearer — patrz RBAC)',
		security: [{ bearerAuth: [] }],
		request: {
			body: {
				content: {
					'application/json': { schema: registerBodySchema },
				},
			},
		},
		responses: stdBearerResponses({
			200: okDataUnknown(
				'Utworzono / zaktualizowano użytkownika (patrz kontroler)',
			),
		}),
	});

	registry.registerPath({
		method: 'post',
		path: '/auth/login',
		tags: ['Auth'],
		summary: 'Logowanie (access_token + cookie refresh)',
		request: {
			body: {
				content: {
					'application/json': { schema: loginBodySchema },
				},
			},
		},
		responses: {
			200: okDataSchema(
				'access_token w JSON; refresh_token w ciasteczku httpOnly',
				authLoginDataSchema,
			),
			400: clientError(),
			403: clientError(),
		},
	});

	registry.registerPath({
		method: 'post',
		path: '/auth/refresh',
		tags: ['Auth'],
		summary: 'Odświeżenie access token (cookie refresh_token)',
		responses: {
			200: okDataSchema('Nowy access_token', accessTokenDataSchema),
			401: clientError('Brak/nieprawidłowe ciasteczko refresh'),
		},
	});

	registry.registerPath({
		method: 'post',
		path: '/auth/logout',
		tags: ['Auth'],
		summary: 'Wylogowanie',
		security: [{ bearerAuth: [] }],
		responses: stdBearerResponses({
			200: okDataUnknown('Zakończono sesję'),
		}),
	});

	registry.registerPath({
		method: 'get',
		path: '/auth/me',
		tags: ['Auth'],
		summary: 'Bieżący użytkownik',
		security: [{ bearerAuth: [] }],
		responses: stdBearerResponses({
			200: {
				description:
					'Profil i kontekst OSK. Dla STUDENT user.pkkNumber zawiera numer PKK lub null.',
				content: {
					'application/json': {
						schema: z.object({
							success: z.literal(true),
							data: z.object({
								user: authMeUserSchema,
							}),
						}),
					},
				},
			},
		}),
	});

	registry.registerPath({
		method: 'get',
		path: '/me/courses',
		tags: ['Courses'],
		summary: 'Kursy aktualnego użytkownika (STUDENT)',
		description:
			'Zwraca kursy kursanta z polem progress 0-100. Progress jest liczony dynamicznie z ukończonych lekcji PRACTICE dla kursów PRACTICAL/EXTRA; THEORY_GROUP zwraca 0 w MVP.',
		security: [{ bearerAuth: [] }],
		responses: stdBearerResponses({
			200: okDataUnknown('Lista kursów aktualnego użytkownika'),
		}),
	});

	registry.registerPath({
		method: 'get',
		path: '/me/payments',
		tags: ['Students'],
		summary: 'OpĹ‚aty aktualnego kursanta (STUDENT)',
		description:
			'Zwraca pĹ‚atnoĹ›ci wyprowadzone z planĂłw pĹ‚atnoĹ›ci kursĂłw, do ktĂłrych zapisany jest aktualny kursant. Role inne niĹĽ STUDENT dostajÄ… pustÄ… listÄ™.',
		security: [{ bearerAuth: [] }],
		responses: stdBearerResponses({
			200: okDataUnknown('Lista opĹ‚at aktualnego kursanta'),
		}),
	});

	registry.registerPath({
		method: 'patch',
		path: '/auth/profile',
		tags: ['Auth'],
		summary: 'Aktualizacja profilu',
		security: [{ bearerAuth: [] }],
		request: {
			body: {
				content: {
					'application/json': {
						schema: z
							.record(z.unknown())
							.describe(
								'Pola profilu — patrz context/auth.md (RBAC po polach)',
							),
					},
				},
			},
		},
		responses: stdBearerResponses({
			200: okDataUnknown('Zaktualizowany profil'),
		}),
	});

	registry.registerPath({
		method: 'post',
		path: '/auth/profile/avatar',
		tags: ['Auth'],
		summary: 'Upload avatara (multipart/form-data, pole file)',
		security: [{ bearerAuth: [] }],
		responses: stdBearerResponses({
			200: okDataUnknown('Nowy avatarUrl'),
		}),
	});

}
