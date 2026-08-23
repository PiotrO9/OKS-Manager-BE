import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import {
	assignStudentDrivingSchoolBodySchema,
	assignStudentToCourseBodySchema,
	listStudentsQuerySchema,
	okDataUnknown,
	patchCourseParticipantStatusBodySchema,
	patchStudentBodySchema,
	patchStudentPkkBodySchema,
	stdBearerResponses,
	studentCourseParamsSchema,
	studentDetailParamsSchema,
	studentDetailQuerySchema,
	studentEventsQuerySchema,
	studentPaymentsQuerySchema,
	studentProcessStatusQuerySchema,
	studentUserIdParamsSchema,
} from './shared';

export function registerStudentPaths(registry: OpenAPIRegistry): void {
	// ── Students ─────────────────────────────────────────────────────────────
	registry.registerPath({
		method: 'get',
		path: '/students',
		tags: ['Students'],
		summary: 'Lista kursantów (INSTRUCTOR)',
		security: [{ bearerAuth: [] }],
		request: { query: listStudentsQuerySchema },
		responses: stdBearerResponses({
			200: okDataUnknown('Paginowana lista'),
		}),
	});

	registry.registerPath({
		method: 'get',
		path: '/students/{userId}',
		tags: ['Students'],
		summary: 'Szczegóły kursanta (STUDENT — własny profil)',
		security: [{ bearerAuth: [] }],
		request: {
			params: studentDetailParamsSchema,
			query: studentDetailQuerySchema,
		},
		responses: stdBearerResponses({
			200: okDataUnknown('Szczegóły'),
		}),
	});

	registry.registerPath({
		method: 'get',
		path: '/students/{userId}/events',
		tags: ['Students'],
		summary:
			'Wydarzenia instruktora przypisane do kursanta (tylko aktywne; opcjonalny zakres dat; schoolId opcjonalne przy jednej OSK)',
		security: [{ bearerAuth: [] }],
		request: {
			params: studentDetailParamsSchema,
			query: studentEventsQuerySchema,
		},
		responses: stdBearerResponses({
			200: okDataUnknown('Lista eventów (data.events)'),
		}),
	});

	registry.registerPath({
		method: 'get',
		path: '/students/{userId}/process-status',
		tags: ['Students'],
		summary: 'Status procesu kursanta (checklista onboardingu)',
		description:
			'Zwraca dynamicznie wyliczona liste krokow procesu kursanta dla podanej OSK. Platnosci pomijamy w v1, bo obecny model nie przypisuje platnosci do konkretnego kursanta.',
		security: [{ bearerAuth: [] }],
		request: {
			params: studentDetailParamsSchema,
			query: studentProcessStatusQuerySchema,
		},
		responses: stdBearerResponses({
			200: okDataUnknown('Checklista krokow procesu kursanta'),
		}),
	});

	registry.registerPath({
		method: 'get',
		path: '/students/{userId}/payments',
		tags: ['Students'],
		summary: 'Historia opĹ‚at kursanta',
		description:
			'Zwraca opĹ‚aty kursanta wyprowadzone z CourseParticipant -> Course -> PaymentPlan -> Payment. Dla INSTRUCTOR/MANAGER/ADMIN query schoolId jest wymagane i zawÄ™ĹĽa wynik do tej OSK; dla STUDENT dozwolony jest tylko wĹ‚asny userId.',
		security: [{ bearerAuth: [] }],
		request: {
			params: studentDetailParamsSchema,
			query: studentPaymentsQuerySchema,
		},
		responses: stdBearerResponses({
			200: okDataUnknown('Lista opĹ‚at kursanta'),
		}),
	});

	registry.registerPath({
		method: 'patch',
		path: '/students/{userId}',
		tags: ['Students'],
		summary: 'Notatki kursanta (INSTRUCTOR)',
		security: [{ bearerAuth: [] }],
		request: {
			params: studentUserIdParamsSchema,
			body: {
				content: {
					'application/json': { schema: patchStudentBodySchema },
				},
			},
		},
		responses: stdBearerResponses({
			200: okDataUnknown('OK'),
		}),
	});

	registry.registerPath({
		method: 'patch',
		path: '/students/{userId}/driving-school',
		tags: ['Students'],
		summary: 'Przypisanie OSK (MANAGER)',
		security: [{ bearerAuth: [] }],
		request: {
			params: studentUserIdParamsSchema,
			body: {
				content: {
					'application/json': {
						schema: assignStudentDrivingSchoolBodySchema,
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
		path: '/students/{userId}/pkk',
		tags: ['Students'],
		summary: 'Numer PKK (INSTRUCTOR)',
		security: [{ bearerAuth: [] }],
		request: {
			params: studentUserIdParamsSchema,
			body: {
				content: {
					'application/json': { schema: patchStudentPkkBodySchema },
				},
			},
		},
		responses: stdBearerResponses({
			200: okDataUnknown('OK'),
		}),
	});

	registry.registerPath({
		method: 'post',
		path: '/students/{userId}/courses',
		tags: ['Students'],
		summary: 'Zapis na kurs (INSTRUCTOR)',
		security: [{ bearerAuth: [] }],
		request: {
			params: studentUserIdParamsSchema,
			body: {
				content: {
					'application/json': {
						schema: assignStudentToCourseBodySchema,
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
		path: '/students/{userId}/courses/{courseId}/status',
		tags: ['Students'],
		summary: 'Status uczestnictwa na kursie (INSTRUCTOR)',
		security: [{ bearerAuth: [] }],
		request: {
			params: studentCourseParamsSchema,
			body: {
				content: {
					'application/json': {
						schema: patchCourseParticipantStatusBodySchema,
					},
				},
			},
		},
		responses: stdBearerResponses({
			200: okDataUnknown('OK'),
		}),
	});
}
