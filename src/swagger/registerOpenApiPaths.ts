import type {
	OpenAPIRegistry,
	RouteConfig,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { instructorAdminPatchBodySchema } from '../lib/validation/instructorAdminPatch';
import {
	assignInstructorToSchoolBodySchema,
	assignStudentDrivingSchoolBodySchema,
	assignStudentToCourseBodySchema,
	courseIdParamsSchema,
	eventIdParamsSchema,
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
	studentUserIdParamsSchema,
	uuidSchema,
} from '../lib/validation/uuid';
import {
	createCourseBodySchema,
	patchCourseBodySchema,
} from '../schemas/course.schemas';
import {
	assignStudentsBodySchema,
	createInstructorEventBodySchema,
	patchInstructorEventBodySchema,
} from '../schemas/event.schemas';
import { bookLessonBodySchema } from '../schemas/lesson.schemas';
import {
	createDrivingSchoolBodySchema,
	setDefaultVehicleBodySchema,
	updateDrivingSchoolBodySchema,
} from '../schemas/driving-school.schemas';
import { schoolAvailabilitySlotsQuerySchema } from '../schemas/school-availability.schemas';
import {
	availabilityInstructorIdParamsSchema,
	computeQuerySchema,
	dayOfWeekParamsSchema,
	exceptionDateParamsSchema,
	exceptionsQuerySchema,
	putExceptionBodySchema,
	putWeeklyBodySchema,
	slotsQuerySchema,
} from '../schemas/instructor-availability.openapi';
import {
	vehicleIdParamsSchema,
	vehicleListQuerySchema,
} from '../schemas/vehicle.schemas';

const loginBodySchema = z.object({
	email: z.string().email(),
	password: z.string().min(1),
});

const registerBodySchema = z
	.object({
		email: z.string().email(),
		password: z.string().min(1),
		role: z.enum(['STUDENT', 'INSTRUCTOR']),
		firstName: z.string().min(1),
		lastName: z.string().min(1),
		phone: z.string().optional().nullable(),
		licenseNumber: z.string().optional().nullable(),
		schoolId: uuidSchema.optional().nullable(),
	})
	.describe('Szczegóły: context/auth.md — zależności pól od roli');

function okDataUnknown(description: string) {
	return {
		description,
		content: {
			'application/json': {
				schema: z.object({
					success: z.literal(true),
					data: z.unknown().optional(),
				}),
			},
		},
	};
}

function clientError(description?: string) {
	return {
		description: description ?? 'Błąd walidacji lub reguł biznesowych',
		content: {
			'application/json': {
				schema: z.object({
					success: z.literal(false),
					error: z.string(),
				}),
			},
		},
	};
}

function stdBearerResponses(
	extra?: Record<string, RouteConfig['responses'][string]>,
) {
	return {
		...extra,
		400: clientError(),
		401: clientError('Brak lub nieprawidłowy Bearer token'),
		403: clientError('Brak wymaganej roli lub dostępu'),
		404: clientError('Zasób nie istnieje'),
	};
}

export function registerOpenApiPaths(registry: OpenAPIRegistry): void {
	registry.registerComponent('securitySchemes', 'bearerAuth', {
		type: 'http',
		scheme: 'bearer',
		bearerFormat: 'JWT',
		description:
			'Access token z POST /auth/login lub POST /auth/refresh. Refresh w httpOnly cookie.',
	});

	registry.registerPath({
		method: 'get',
		path: '/test',
		tags: ['Health'],
		summary: 'Test połączenia',
		responses: {
			200: {
				description: 'OK',
				content: {
					'application/json': {
						schema: z.object({
							success: z.literal(true),
							data: z.object({
								message: z.string(),
							}),
						}),
					},
				},
			},
		},
	});

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
			200: okDataUnknown(
				'access_token w JSON; refresh_token w ciasteczku httpOnly',
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
			200: okDataUnknown('Nowy access_token'),
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
			200: okDataUnknown('Profil i kontekst OSK'),
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
			200: okDataUnknown('OK'),
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
			'Parametr lessonType jest zarezerwowany (MVP bez wpływu na wynik). excludeMyLessons domyślnie true dla STUDENT.',
		security: [{ bearerAuth: [] }],
		request: {
			params: drivingSchoolIdParamsSchema,
			query: schoolAvailabilitySlotsQuerySchema,
		},
		responses: stdBearerResponses({
			200: okDataUnknown('slots + total'),
		}),
	});

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
			200: okDataUnknown('Pojazd'),
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
			200: okDataUnknown('Pojazd + status HTTP z serwisu'),
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
			200: okDataUnknown('OK'),
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
			200: okDataUnknown('OK'),
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

	// ── Lessons ───────────────────────────────────────────────────────────────
	registry.registerPath({
		method: 'post',
		path: '/lessons',
		tags: ['Lessons'],
		summary: 'Rezerwacja lekcji (MANAGER+)',
		security: [{ bearerAuth: [] }],
		request: {
			body: {
				content: {
					'application/json': {
						schema: bookLessonBodySchema,
					},
				},
			},
		},
		responses: stdBearerResponses({
			201: okDataUnknown('Utworzona lekcja (data.lesson)'),
			409: clientError('Konflikt czasu, grafiku lub pojazdu'),
		}),
	});

	// ── Events ────────────────────────────────────────────────────────────────
	registry.registerPath({
		method: 'post',
		path: '/events',
		tags: ['Events'],
		summary: 'Tworzenie wydarzenia instruktora (MANAGER)',
		security: [{ bearerAuth: [] }],
		request: {
			body: {
				content: {
					'application/json': {
						schema: createInstructorEventBodySchema,
					},
				},
			},
		},
		responses: stdBearerResponses({
			201: okDataUnknown(
				'Utworzone wydarzenie (data.event, pola m.in. capacity)',
			),
			409: clientError('Konflikt czasu, grafiku lub pojazdu'),
		}),
	});

	registry.registerPath({
		method: 'patch',
		path: '/events/{id}',
		tags: ['Events'],
		summary: 'Edycja wydarzenia instruktora (MANAGER)',
		description:
			'Częściowy update (PATCH). Przy zmianie czasu lub instruktora: walidacja dostępności i kolizji; edytowany event jest wykluczany z nakładania na siebie. Szczegóły: context/events-schedule-api.md',
		security: [{ bearerAuth: [] }],
		request: {
			params: eventIdParamsSchema,
			body: {
				content: {
					'application/json': {
						schema: patchInstructorEventBodySchema,
					},
				},
			},
		},
		responses: stdBearerResponses({
			200: okDataUnknown(
				'Zaktualizowane wydarzenie (data.event, pola m.in. capacity)',
			),
			409: clientError('Konflikt czasu, grafiku lub pojazdu'),
		}),
	});

	registry.registerPath({
		method: 'post',
		path: '/events/{id}/students',
		tags: ['Events'],
		summary: 'Przypisanie kursantów do wydarzenia (MANAGER)',
		security: [{ bearerAuth: [] }],
		request: {
			params: eventIdParamsSchema,
			body: {
				content: {
					'application/json': {
						schema: assignStudentsBodySchema,
					},
				},
			},
		},
		responses: stdBearerResponses({
			200: okDataUnknown(
				'Liczba przypisanych i pominiętych (data.assigned, data.skipped)',
			),
			409: clientError(
				'Przekroczono capacity lub konflikt czasowy kursanta',
			),
		}),
	});

	// ── Course types ─────────────────────────────────────────────────────────
	registry.registerPath({
		method: 'get',
		path: '/course-types',
		tags: ['Course types'],
		summary: 'Typy kursów (MANAGER)',
		security: [{ bearerAuth: [] }],
		responses: stdBearerResponses({
			200: okDataUnknown('Lista typów'),
		}),
	});
}
