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

export function registerDrivingSchoolPaths(registry: OpenAPIRegistry): void {
	// ── Driving schools ──────────────────────────────────────────────────────
	registry.registerPath({
		method: 'get',
		path: '/driving-schools',
		tags: ['Driving schools'],
		summary: 'Lista OSK dla użytkownika',
		security: [{ bearerAuth: [] }],
		responses: stdBearerResponses({
			200: okDataUnknown('Lista szkół'),
		}),
	});

	registry.registerPath({
		method: 'get',
		path: '/driving-schools/default',
		tags: ['Driving schools'],
		summary: 'Domyślna OSK',
		security: [{ bearerAuth: [] }],
		responses: stdBearerResponses({
			200: okDataUnknown('Domyślna szkoła lub null'),
		}),
	});

	registry.registerPath({
		method: 'post',
		path: '/driving-schools',
		tags: ['Driving schools'],
		summary: 'Tworzenie OSK (MANAGER)',
		security: [{ bearerAuth: [] }],
		request: {
			body: {
				content: {
					'application/json': {
						schema: createDrivingSchoolBodySchema,
					},
				},
			},
		},
		responses: stdBearerResponses({
			201: okDataUnknown('Utworzona szkoła'),
		}),
	});

	registry.registerPath({
		method: 'patch',
		path: '/driving-schools/{id}',
		tags: ['Driving schools'],
		summary: 'Aktualizacja OSK (MANAGER)',
		security: [{ bearerAuth: [] }],
		request: {
			params: drivingSchoolIdParamsSchema,
			body: {
				content: {
					'application/json': {
						schema: updateDrivingSchoolBodySchema,
					},
				},
			},
		},
		responses: stdBearerResponses({
			200: okDataUnknown('Zaktualizowana szkoła'),
		}),
	});

	registry.registerPath({
		method: 'patch',
		path: '/driving-schools/{id}/set-default',
		tags: ['Driving schools'],
		summary: 'Ustaw domyślną OSK (MANAGER)',
		security: [{ bearerAuth: [] }],
		request: { params: drivingSchoolIdParamsSchema },
		responses: stdBearerResponses({
			200: okDataSchema('OK', vehicleDataSchema),
		}),
	});

	registry.registerPath({
		method: 'patch',
		path: '/driving-schools/{id}/default-vehicle',
		tags: ['Driving schools'],
		summary: 'Domyślny pojazd dla OSK (MANAGER)',
		security: [{ bearerAuth: [] }],
		request: {
			params: drivingSchoolIdParamsSchema,
			body: {
				content: {
					'application/json': { schema: setDefaultVehicleBodySchema },
				},
			},
		},
		responses: stdBearerResponses({
			200: okDataUnknown('OK'),
		}),
	});

	registry.registerPath({
		method: 'delete',
		path: '/driving-schools/{id}',
		tags: ['Driving schools'],
		summary: 'Soft-delete OSK (MANAGER)',
		security: [{ bearerAuth: [] }],
		request: { params: drivingSchoolIdParamsSchema },
		responses: stdBearerResponses({
			200: okDataUnknown('OK'),
		}),
	});

	registry.registerPath({
		method: 'get',
		path: '/driving-schools/{id}/availability/slots',
		tags: ['Driving schools'],
		summary:
			'Agregowana lista slotów dostępności instruktorów szkoły (ADMIN, MANAGER, INSTRUCTOR, STUDENT)',
		description:
			'Parametr lessonType jest zarezerwowany (MVP bez wpływu na wynik). excludeMyLessons domyślnie true dla STUDENT. Jeśli podano courseId, wynik obejmuje tylko instruktorów z uprawnieniem do kategorii Course.courseTypeId.',
		security: [{ bearerAuth: [] }],
		request: {
			params: drivingSchoolIdParamsSchema,
			query: schoolAvailabilitySlotsQuerySchema,
		},
		responses: stdBearerResponses({
			200: okDataUnknown('slots + total'),
		}),
	});

}
