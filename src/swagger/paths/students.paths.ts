import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import {
	assignStudentDrivingSchoolBodySchema,
	assignStudentToCourseBodySchema,
	createStudentPaymentBodySchema,
	listStudentsQuerySchema,
	markStudentPaymentPaidBodySchema,
	markStudentPaymentUnpaidBodySchema,
	okDataUnknown,
	patchCourseParticipantStatusBodySchema,
	patchStudentBodySchema,
	patchStudentPkkBodySchema,
	stdBearerResponses,
	studentCourseParamsSchema,
	studentDetailParamsSchema,
	studentDetailQuerySchema,
	studentEventsQuerySchema,
	studentPaymentParamsSchema,
	studentPaymentsQuerySchema,
	studentProcessStatusQuerySchema,
	studentUserIdParamsSchema,
	updateStudentPaymentBodySchema,
} from './shared';

export function registerStudentPaths(registry: OpenAPIRegistry): void {
	// ── Students ─────────────────────────────────────────────────────────────
	registry.registerPath({
		method: 'get',
		path: '/students',
		tags: ['Students'],
		summary:
			'Lista kursantów z wyszukiwaniem, szybkimi i zaawansowanymi filtrami',
		description:
			'search: słowa wyszukiwane w imieniu, nazwisku, e-mailu, telefonie i PKK (bez rozróżniania wielkości liter). view: all, without-pkk, without-course, overdue, without-lesson. filters: JSON z maksymalnie 8 regułami Pole/Warunek/Wartość, np. [{"field":"isActive","operator":"neq","value":false},{"field":"courseId","operator":"neq","value":"00000000-0000-4000-8000-000000000000"}]. Dozwolone pola: firstName, lastName, email, phone, pkkNumber, isActive, courseId, hasOverduePayments, hasUpcomingLesson, createdAt. Warstwy schoolId, courseId, search, view i filters łączą się przez AND przed count i paginacją.',
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
		method: 'post',
		path: '/students/{userId}/payments',
		tags: ['Students'],
		summary: 'Utworzenie płatności kursanta (MANAGER)',
		security: [{ bearerAuth: [] }],
		request: {
			params: studentUserIdParamsSchema,
			body: {
				content: {
					'application/json': {
						schema: createStudentPaymentBodySchema,
					},
				},
			},
		},
		responses: stdBearerResponses({
			201: okDataUnknown('Utworzona płatność'),
		}),
	});

	registry.registerPath({
		method: 'patch',
		path: '/students/{userId}/payments/{paymentId}',
		tags: ['Students'],
		summary: 'Aktualizacja płatności kursanta (MANAGER)',
		security: [{ bearerAuth: [] }],
		request: {
			params: studentPaymentParamsSchema,
			body: {
				content: {
					'application/json': {
						schema: updateStudentPaymentBodySchema,
					},
				},
			},
		},
		responses: stdBearerResponses({
			200: okDataUnknown('Zaktualizowana płatność'),
		}),
	});

	registry.registerPath({
		method: 'patch',
		path: '/students/{userId}/payments/{paymentId}/mark-paid',
		tags: ['Students'],
		summary: 'Oznaczenie płatności jako opłaconej (MANAGER)',
		security: [{ bearerAuth: [] }],
		request: {
			params: studentPaymentParamsSchema,
			body: {
				content: {
					'application/json': {
						schema: markStudentPaymentPaidBodySchema,
					},
				},
			},
		},
		responses: stdBearerResponses({
			200: okDataUnknown('Płatność oznaczona jako opłacona'),
		}),
	});

	registry.registerPath({
		method: 'patch',
		path: '/students/{userId}/payments/{paymentId}/mark-unpaid',
		tags: ['Students'],
		summary: 'Cofnięcie oznaczenia płatności jako opłaconej (MANAGER)',
		security: [{ bearerAuth: [] }],
		request: {
			params: studentPaymentParamsSchema,
			body: {
				content: {
					'application/json': {
						schema: markStudentPaymentUnpaidBodySchema,
					},
				},
			},
		},
		responses: stdBearerResponses({
			200: okDataUnknown('Płatność oznaczona jako nieopłacona'),
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
