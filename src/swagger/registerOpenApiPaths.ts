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
	eligibleStudentsQuerySchema,
	getEventQuerySchema,
	patchInstructorEventBodySchema,
	replaceEventStudentsBodySchema,
} from '../schemas/event.schemas';
import {
	bookLessonBodySchema,
	cancelLessonBodySchema,
} from '../schemas/lesson.schemas';
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
	vehicleAvailabilityStatusSchema,
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
		method: 'get',
		path: '/me/courses',
		tags: ['Courses'],
		summary: 'Kursy aktualnego użytkownika (STUDENT)',
		security: [{ bearerAuth: [] }],
		responses: stdBearerResponses({
			200: okDataUnknown('Lista kursów aktualnego użytkownika'),
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
			200: okDataUnknown('Zaktualizowany pojazd'),
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

	registry.registerPath({
		method: 'get',
		path: '/lessons/{id}',
		tags: ['Lessons'],
		summary: 'Szczegóły lekcji (MANAGER+)',
		description:
			'Odczyt pojedynczej lekcji praktycznej (`Lesson`): jazda 1:1. `data.lesson` bez osobnych `studentId`/`instructorId`/`vehicleId` — identyfikatory w `lesson.student.id`, `lesson.instructor.id`, `lesson.vehicle` (albo `vehicle: null`). Pozostałe pola jak przy tworzeniu lekcji (`id`, `courseId`, czasy, status itd.).',
		security: [{ bearerAuth: [] }],
		request: {
			params: lessonIdParamsSchema,
		},
		responses: stdBearerResponses({
			200: okDataUnknown('Lekcja (data.lesson)'),
			404: clientError('Lekcja nie znaleziona'),
		}),
	});

	registry.registerPath({
		method: 'patch',
		path: '/lessons/{id}',
		tags: ['Lessons'],
		summary: 'Anulowanie jazdy (MANAGER+)',
		description:
			'Ustawia status CANCELLED. Tylko ze SCHEDULED. Anulowana jazda nie zużywa godzin pakietu; slot instruktora i pojazdu zwalniają się dla innych rezerwacji.',
		security: [{ bearerAuth: [] }],
		request: {
			params: lessonIdParamsSchema,
			body: {
				content: {
					'application/json': {
						schema: cancelLessonBodySchema,
					},
				},
			},
		},
		responses: stdBearerResponses({
			200: okDataUnknown(
				'Zaktualizowana lekcja (data.lesson, status CANCELLED)',
			),
			400: clientError(
				'Nie można anulować (np. już COMPLETED/CANCELLED)',
			),
			404: clientError('Lekcja nie znaleziona'),
		}),
	});

	// ── Events ────────────────────────────────────────────────────────────────
	registry.registerPath({
		method: 'post',
		path: '/events',
		tags: ['Events'],
		summary: 'Tworzenie wydarzenia instruktora (MANAGER)',
		description:
			'Dla THEORY opcjonalne `courseId` wiąże event z kursem; uczestników (`event_participants`) trzeba dodać osobno przez POST/PUT `/events/{id}/students` — przy tworzeniu lista jest pusta.',
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
		method: 'get',
		path: '/events/{id}',
		tags: ['Events'],
		summary: 'Szczegóły wydarzenia instruktora (MANAGER)',
		description:
			'Odczyt pojedynczego `InstructorEvent`: `data.event` z `instructor` (jak osoba przy GET `/lessons/{id}`), opcjonalnie `courseId`, `capacity`, oraz `students` — tablica uczestników z `event_participants` w tym samym kształcie pól; kolejność jak przy GET `/events/{id}/students`. Query `includeSlots=true` dodaje `freeWindows` (wolne okna instruktora na dzień eventu). Szczegóły: context/events-schedule-api.md',
		security: [{ bearerAuth: [] }],
		request: {
			params: eventIdParamsSchema,
			query: getEventQuerySchema,
		},
		responses: stdBearerResponses({
			200: okDataUnknown(
				'Event (data.event: instructor + students, opcjonalnie freeWindows)',
			),
		}),
	});

	registry.registerPath({
		method: 'patch',
		path: '/events/{id}',
		tags: ['Events'],
		summary: 'Edycja wydarzenia instruktora (MANAGER)',
		description:
			'Częściowy update (PATCH). Przy zmianie czasu lub instruktora: walidacja dostępności i kolizji; edytowany event jest wykluczany z nakładania na siebie; przy istniejących uczestnikach — brak kolizji ich grafiku z nowym oknem. Szczegóły: context/events-schedule-api.md',
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
		method: 'delete',
		path: '/events/{id}',
		tags: ['Events'],
		summary: 'Soft delete wydarzenia instruktora (MANAGER)',
		description:
			'Oznacza rekord jako nieaktywny (isActive = false). Nie usuwa uczestników ani powiązań. Nieaktywne eventy nie są zwracane w harmonogramie i nie blokują slotów.',
		security: [{ bearerAuth: [] }],
		request: {
			params: eventIdParamsSchema,
		},
		responses: stdBearerResponses({
			204: {
				description:
					'Sukces — `{ success: true }` (bez pola data); wydarzenie oznaczone jako nieaktywne',
				content: {
					'application/json': {
						schema: z.object({ success: z.literal(true) }),
					},
				},
			},
		}),
	});

	registry.registerPath({
		method: 'get',
		path: '/events/{id}/students',
		tags: ['Events'],
		summary: 'Lista kursantów przypisanych do wydarzenia (MANAGER)',
		security: [{ bearerAuth: [] }],
		request: {
			params: eventIdParamsSchema,
		},
		responses: stdBearerResponses({
			200: okDataUnknown(
				'UUID użytkowników (users.id) — data.studentUserIds',
			),
		}),
	});

	registry.registerPath({
		method: 'get',
		path: '/events/{id}/eligible-students',
		tags: ['Events'],
		summary:
			'Kursanci kursu powiązanego z eventem THEORY — kolizje i capacity (MANAGER)',
		description:
			'Tylko `THEORY` z `courseId`: uczestnicy aktywni kursu (`course_participants` ACTIVE), pola `hasScheduleConflict` / `canAssign` zgodne z walidacją POST/PUT `/events/{id}/students`. Opcjonalnie `startTime` + `endTime` (ISO) nadpisują okno czasowe przy liczeniu kolizji. Szczegóły: context/events-schedule-api.md',
		security: [{ bearerAuth: [] }],
		request: {
			params: eventIdParamsSchema,
			query: eligibleStudentsQuerySchema,
		},
		responses: stdBearerResponses({
			200: okDataUnknown(
				'data.courseId, data.capacity (limit, used, remaining), data.students[]',
			),
			422: clientError(
				'Event nie THEORY lub brak powiązanego kursu (courseId)',
			),
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
			422: clientError(
				'Event nie THEORY lub kursant nie w odpowiedniej szkole OSK',
			),
		}),
	});

	registry.registerPath({
		method: 'put',
		path: '/events/{id}/students',
		tags: ['Events'],
		summary: 'Pełna zamiana listy kursantów na wydarzeniu (MANAGER)',
		description:
			'Stan docelowy = dokładnie studentIds (users.id); pusta tablica usuwa wszystkich. Tylko wydarzenia THEORY.',
		security: [{ bearerAuth: [] }],
		request: {
			params: eventIdParamsSchema,
			body: {
				content: {
					'application/json': {
						schema: replaceEventStudentsBodySchema,
					},
				},
			},
		},
		responses: stdBearerResponses({
			200: okDataUnknown(
				'Stan po zapisie: data.studentUserIds (posortowane UUID)',
			),
			409: clientError(
				'Przekroczono capacity lub konflikt czasowy kursanta',
			),
			422: clientError(
				'Event nie THEORY lub kursant nie w odpowiedniej szkole OSK',
			),
		}),
	});

	registry.registerPath({
		method: 'delete',
		path: '/events/{id}/students/{studentUserId}',
		tags: ['Events'],
		summary: 'Usunięcie jednego kursanta z wydarzenia (MANAGER)',
		description:
			'Parametr studentUserId — users.id kursanta. Tylko wydarzenia THEORY.',
		security: [{ bearerAuth: [] }],
		request: {
			params: eventIdAndStudentUserParamsSchema,
		},
		responses: stdBearerResponses({
			200: okDataUnknown(
				'Pozostali uczestnicy: data.studentUserIds (posortowane UUID)',
			),
			422: clientError('Event nie THEORY'),
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
