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

export function registerInstructorPaths(registry: OpenAPIRegistry): void {
	// ── Instructors ─────────────────────────────────────────────────────────
	registry.registerPath({
		method: 'get',
		path: '/instructors',
		tags: ['Instructors'],
		summary: 'Lista instruktorów dla schoolId (MANAGER)',
		security: [{ bearerAuth: [] }],
		request: { query: schoolIdQuerySchema },
		responses: stdBearerResponses({
			200: okDataUnknown('Lista instruktorów'),
		}),
	});

	registry.registerPath({
		method: 'get',
		path: '/instructors/{id}',
		tags: ['Instructors'],
		summary: 'Szczegóły instruktora (MANAGER)',
		security: [{ bearerAuth: [] }],
		request: { params: instructorIdParamsSchema },
		responses: stdBearerResponses({
			200: okDataUnknown('Instruktor'),
		}),
	});

	registry.registerPath({
		method: 'get',
		path: '/instructors/{id}/ratings',
		tags: ['Ratings'],
		summary: 'Opinie o lekcjach konkretnego instruktora (MANAGER+)',
		description:
			'Zwraca opinie z LessonRating dla zakończonych lekcji praktycznych instruktora w wybranej OSK oraz summary: averageRating i totalCount.',
		security: [{ bearerAuth: [] }],
		request: {
			params: instructorIdParamsSchema,
			query: instructorLessonRatingsQuerySchema,
		},
		responses: stdBearerResponses({
			200: okDataUnknown('Lista opinii instruktora + summary'),
		}),
	});

	registry.registerPath({
		method: 'post',
		path: '/instructors/{id}/schools',
		tags: ['Instructors'],
		summary: 'Przypisanie instruktora do OSK (MANAGER)',
		security: [{ bearerAuth: [] }],
		request: {
			params: instructorIdParamsSchema,
			body: {
				content: {
					'application/json': {
						schema: assignInstructorToSchoolBodySchema,
					},
				},
			},
		},
		responses: stdBearerResponses({
			200: okDataUnknown('OK'),
		}),
	});

	registry.registerPath({
		method: 'patch',
		path: '/instructors/{id}',
		tags: ['Instructors'],
		summary: 'PATCH profilu instruktora (MANAGER/ADMIN)',
		description:
			'Aktualizuje dane instruktora. `qualifiedCourseTypeIds` opcjonalnie zastępuje pełną listę strukturalnych kategorii uprawnień instruktora; `[]` czyści listę.',
		security: [{ bearerAuth: [] }],
		request: {
			params: instructorIdParamsSchema,
			body: {
				content: {
					'application/json': {
						schema: instructorAdminPatchBodySchema,
					},
				},
			},
		},
		responses: stdBearerResponses({
			200: okDataUnknown('Zaktualizowano'),
		}),
	});

	registry.registerPath({
		method: 'delete',
		path: '/instructors/{id}',
		tags: ['Instructors'],
		summary: 'Usunięcie instruktora (MANAGER)',
		security: [{ bearerAuth: [] }],
		request: { params: instructorIdParamsSchema },
		responses: stdBearerResponses({
			200: okDataUnknown('OK'),
		}),
	});

	// ── Instructor availability ─────────────────────────────────────────────
	registry.registerPath({
		method: 'get',
		path: '/instructors/{instructorId}/availability/weekly',
		tags: ['Instructor availability'],
		summary: 'Tygodniowy szablon godzin (MANAGER)',
		security: [{ bearerAuth: [] }],
		request: { params: availabilityInstructorIdParamsSchema },
		responses: stdBearerResponses({
			200: okDataUnknown('Szablon tygodniowy'),
		}),
	});

	registry.registerPath({
		method: 'put',
		path: '/instructors/{instructorId}/availability/weekly/{dayOfWeek}',
		tags: ['Instructor availability'],
		summary: 'Ustaw dzień tygodnia (MANAGER)',
		security: [{ bearerAuth: [] }],
		request: {
			params: dayOfWeekParamsSchema,
			body: {
				content: {
					'application/json': { schema: putWeeklyBodySchema },
				},
			},
		},
		responses: stdBearerResponses({
			200: okDataUnknown('OK'),
		}),
	});

	registry.registerPath({
		method: 'delete',
		path: '/instructors/{instructorId}/availability/weekly/{dayOfWeek}',
		tags: ['Instructor availability'],
		summary: 'Usuń dzień z szablonu (MANAGER)',
		security: [{ bearerAuth: [] }],
		request: { params: dayOfWeekParamsSchema },
		responses: stdBearerResponses({
			200: okDataUnknown('OK'),
		}),
	});

	registry.registerPath({
		method: 'get',
		path: '/instructors/{instructorId}/availability/exceptions',
		tags: ['Instructor availability'],
		summary: 'Wyjątki w zakresie dat (MANAGER)',
		security: [{ bearerAuth: [] }],
		request: {
			params: availabilityInstructorIdParamsSchema,
			query: exceptionsQuerySchema,
		},
		responses: stdBearerResponses({
			200: okDataUnknown('Lista wyjątków'),
		}),
	});

	registry.registerPath({
		method: 'put',
		path: '/instructors/{instructorId}/availability/exceptions/{date}',
		tags: ['Instructor availability'],
		summary: 'Ustaw wyjątek dla daty (MANAGER)',
		security: [{ bearerAuth: [] }],
		request: {
			params: exceptionDateParamsSchema,
			body: {
				content: {
					'application/json': { schema: putExceptionBodySchema },
				},
			},
		},
		responses: stdBearerResponses({
			200: okDataUnknown('OK'),
		}),
	});

	registry.registerPath({
		method: 'delete',
		path: '/instructors/{instructorId}/availability/exceptions/{date}',
		tags: ['Instructor availability'],
		summary: 'Usuń wyjątek (MANAGER)',
		security: [{ bearerAuth: [] }],
		request: { params: exceptionDateParamsSchema },
		responses: stdBearerResponses({
			200: okDataUnknown('OK'),
		}),
	});

	registry.registerPath({
		method: 'get',
		path: '/instructors/{instructorId}/availability/compute',
		tags: ['Instructor availability'],
		summary: 'Oblicz sloty dla daty (MANAGER)',
		security: [{ bearerAuth: [] }],
		request: {
			params: availabilityInstructorIdParamsSchema,
			query: computeQuerySchema,
		},
		responses: stdBearerResponses({
			200: okDataUnknown('Wynik compute'),
		}),
	});

	registry.registerPath({
		method: 'get',
		path: '/instructors/{instructorId}/availability/slots',
		tags: ['Instructor availability'],
		summary: 'Lista dostępnych slotów w zakresie dat (MANAGER)',
		security: [{ bearerAuth: [] }],
		request: {
			params: availabilityInstructorIdParamsSchema,
			query: slotsQuerySchema,
		},
		responses: stdBearerResponses({
			200: okDataUnknown('Lista slotów'),
		}),
	});

}
