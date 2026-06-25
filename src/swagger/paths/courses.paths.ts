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

export function registerCoursePaths(registry: OpenAPIRegistry): void {
	// ── Courses ──────────────────────────────────────────────────────────────
	registry.registerPath({
		method: 'get',
		path: '/courses',
		tags: ['Courses'],
		summary: 'Lista kursów (MANAGER)',
		security: [{ bearerAuth: [] }],
		responses: stdBearerResponses({
			200: okDataUnknown('Lista kursów'),
		}),
	});

	registry.registerPath({
		method: 'get',
		path: '/courses/{id}',
		tags: ['Courses'],
		summary: 'Szczegóły kursu (MANAGER)',
		security: [{ bearerAuth: [] }],
		request: { params: courseIdParamsSchema },
		responses: stdBearerResponses({
			200: okDataUnknown('Kurs'),
		}),
	});

	registry.registerPath({
		method: 'post',
		path: '/courses',
		tags: ['Courses'],
		summary: 'Utworzenie kursu (MANAGER)',
		description:
			'Pole category jest kodem CourseType. Jeśli podano instructorId, instruktor musi należeć do OSK i mieć uprawnienie do kategorii kursu.',
		security: [{ bearerAuth: [] }],
		request: {
			body: {
				content: {
					'application/json': { schema: createCourseBodySchema },
				},
			},
		},
		responses: stdBearerResponses({
			201: okDataUnknown('Utworzony kurs'),
		}),
	});

	registry.registerPath({
		method: 'patch',
		path: '/courses/{id}',
		tags: ['Courses'],
		summary: 'Aktualizacja kursu (MANAGER)',
		description:
			'Zmiana instructorId wymaga, aby instruktor należał do OSK i miał uprawnienie do Course.courseTypeId.',
		security: [{ bearerAuth: [] }],
		request: {
			params: courseIdParamsSchema,
			body: {
				content: {
					'application/json': { schema: patchCourseBodySchema },
				},
			},
		},
		responses: stdBearerResponses({
			200: okDataUnknown('OK'),
		}),
	});

}
