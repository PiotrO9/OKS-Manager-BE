import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import {
	bookLessonBodySchema,
	bookOwnLessonBodySchema,
	clientError,
	createLessonRatingBodySchema,
	lessonDtoSchema,
	lessonIdParamsSchema,
	lessonInstructorOptionsQuerySchema,
	lessonRatingDtoSchema,
	lessonRatingParamsSchema,
	listLessonRatingsQuerySchema,
	ownLessonRatingsQuerySchema,
	okDataSchema,
	okDataUnknown,
	patchLessonBodySchema,
	stdBearerResponses,
	z,
} from './shared';

export function registerLessonPaths(registry: OpenAPIRegistry): void {
	// ── Lessons ───────────────────────────────────────────────────────────────
	registry.registerPath({
		method: 'post',
		path: '/lessons',
		tags: ['Lessons'],
		summary: 'Rezerwacja lekcji (MANAGER+)',
		description:
			'Tworzy jazdę praktyczną. Instruktor musi mieć uprawnienie do kategorii kursu (`Course.courseTypeId`).',
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
			201: okDataSchema(
				'Utworzona lekcja (data.lesson)',
				z.object({ lesson: lessonDtoSchema }),
			),
			409: clientError('Konflikt czasu, grafiku lub pojazdu'),
		}),
	});

	registry.registerPath({
		method: 'post',
		path: '/lessons/me',
		tags: ['Lessons'],
		summary: 'Samodzielna rezerwacja jazdy praktycznej (STUDENT)',
		description:
			'Tworzy Lesson PRACTICE dla zalogowanego kursanta. Backend bierze kursanta z tokenu, nie przyjmuje studentId/vehicleId/lessonType i automatycznie dobiera dostepny pojazd.',
		security: [{ bearerAuth: [] }],
		request: {
			body: {
				content: {
					'application/json': {
						schema: bookOwnLessonBodySchema,
					},
				},
			},
		},
		responses: stdBearerResponses({
			201: okDataSchema(
				'Utworzona lekcja (data.lesson)',
				z.object({ lesson: lessonDtoSchema }),
			),
			400: clientError('Bledne dane lub kurs niekwalifikowany'),
			403: clientError('Kurs nie nalezy do zalogowanego kursanta'),
			404: clientError('Kurs lub instruktor nie istnieje'),
			409: clientError('Konflikt czasu, limitu godzin albo pojazdu'),
		}),
	});

	registry.registerPath({
		method: 'get',
		path: '/lessons/{id}/instructor-options',
		tags: ['Lessons'],
		summary: 'Dostępni instruktorzy zastępczy dla jednej jazdy (MANAGER+)',
		description:
			'Zwraca aktywnych instruktorów z tej szkoły, uprawnionych do kategorii kursu i dostępnych przez cały podany termin z wybranym pojazdem. Lekcja musi być zaplanowana i nie może się jeszcze rozpocząć.',
		security: [{ bearerAuth: [] }],
		request: {
			params: lessonIdParamsSchema,
			query: lessonInstructorOptionsQuerySchema,
		},
		responses: stdBearerResponses({
			200: okDataUnknown(
				'Lista dostępnych instruktorów (data.instructors)',
			),
			400: clientError(
				'Niepoprawny termin lub lekcja już się rozpoczęła',
			),
			404: clientError('Lekcja nie znaleziona'),
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
			200: okDataSchema(
				'Lekcja (data.lesson)',
				z.object({ lesson: lessonDtoSchema }),
			),
			404: clientError('Lekcja nie znaleziona'),
		}),
	});

	registry.registerPath({
		method: 'patch',
		path: '/lessons/{lessonId}/cancel',
		tags: ['Lessons'],
		summary: 'Anulowanie wlasnej jazdy praktycznej (STUDENT)',
		description:
			'Ustawia status CANCELLED dla zaplanowanej lekcji praktycznej zalogowanego kursanta. Backend bierze kursanta z tokenu i nie przyjmuje body.',
		security: [{ bearerAuth: [] }],
		request: {
			params: lessonRatingParamsSchema,
		},
		responses: stdBearerResponses({
			200: okDataSchema(
				'Zaktualizowana lekcja (data.lesson, status CANCELLED)',
				z.object({ lesson: lessonDtoSchema }),
			),
			400: clientError(
				'Lekcja nie jest jazda praktyczna albo nie mozna jej anulowac',
			),
			403: clientError('Lekcja nie nalezy do zalogowanego kursanta'),
			404: clientError('Lekcja nie znaleziona'),
		}),
	});

	registry.registerPath({
		method: 'get',
		path: '/lessons/{lessonId}/rating',
		tags: ['Lessons'],
		summary: 'Pobranie opinii kursanta dla konkretnej lekcji (STUDENT)',
		description:
			'Zwraca `LessonRating` dla lekcji praktycznej zalogowanego kursanta albo `data.rating: null`, gdy opinia nie istnieje.',
		security: [{ bearerAuth: [] }],
		request: {
			params: lessonRatingParamsSchema,
		},
		responses: stdBearerResponses({
			200: okDataSchema(
				'Opinia lekcji albo null (data.rating)',
				z.object({ rating: lessonRatingDtoSchema.nullable() }),
			),
			400: clientError('Lekcja nie jest jazda praktyczna'),
			403: clientError('Lekcja nie nalezy do zalogowanego kursanta'),
			404: clientError('Lekcja nie znaleziona'),
		}),
	});

	registry.registerPath({
		method: 'post',
		path: '/lessons/{lessonId}/rating',
		tags: ['Lessons'],
		summary: 'Dodanie opinii po lekcji praktycznej (STUDENT)',
		description:
			'Tworzy `LessonRating` dla zakoĹ„czonej lekcji praktycznej zalogowanego kursanta. Backend bierze `studentId` i `instructorId` z lekcji, nie z requestu.',
		security: [{ bearerAuth: [] }],
		request: {
			params: lessonRatingParamsSchema,
			body: {
				content: {
					'application/json': {
						schema: createLessonRatingBodySchema,
					},
				},
			},
		},
		responses: stdBearerResponses({
			201: okDataSchema(
				'Utworzona opinia (data.rating)',
				z.object({ rating: lessonRatingDtoSchema }),
			),
			400: clientError('BĹ‚Ä™dne dane lub lekcja niekwalifikowana'),
			403: clientError('Lekcja nie naleĹĽy do zalogowanego kursanta'),
			404: clientError('Lekcja nie znaleziona'),
			409: clientError('Opinia dla lekcji juĹĽ istnieje'),
		}),
	});

	registry.registerPath({
		method: 'get',
		path: '/ratings',
		tags: ['Ratings'],
		summary: 'Lista opinii o lekcjach w OSK (MANAGER+)',
		description:
			'Wewnętrzny widok managerski oparty o LessonRating. Obsługuje filtrowanie po szkole, instruktorze, okresie oraz zakresie dat.',
		security: [{ bearerAuth: [] }],
		request: {
			query: listLessonRatingsQuerySchema,
		},
		responses: stdBearerResponses({
			200: okDataUnknown('Lista opinii + summary'),
		}),
	});

	registry.registerPath({
		method: 'get',
		path: '/ratings/me',
		tags: ['Ratings'],
		summary: 'Lista opinii o własnych lekcjach (INSTRUCTOR)',
		description:
			'Instruktor widzi opinie o swoich zakończonych lekcjach praktycznych. Odpowiedź nie zawiera danych kursanta.',
		security: [{ bearerAuth: [] }],
		request: {
			query: ownLessonRatingsQuerySchema,
		},
		responses: stdBearerResponses({
			200: okDataUnknown(
				'Lista opinii instruktora + summary i paginacja',
			),
		}),
	});

	registry.registerPath({
		method: 'patch',
		path: '/lessons/{id}',
		tags: ['Lessons'],
		summary: 'Edycja lub anulowanie pojedynczej jazdy (MANAGER+)',
		description:
			'Edycja czasu, pojazdu lub instruktora pojedynczej zaplanowanej jazdy albo ustawienie statusu CANCELLED. Zmiana instruktora jest możliwa wyłącznie przed rozpoczęciem lekcji; wymaga expectedLessonState, aktywnego instruktora z uprawnieniami i dostępności przez cały termin. Przypisanie instruktora do kursu pozostaje bez zmian.',
		security: [{ bearerAuth: [] }],
		request: {
			params: lessonIdParamsSchema,
			body: {
				content: {
					'application/json': {
						schema: patchLessonBodySchema,
					},
				},
			},
		},
		responses: stdBearerResponses({
			200: okDataSchema(
				'Zaktualizowana lekcja (data.lesson, status CANCELLED)',
				z.object({ lesson: lessonDtoSchema }),
			),
			400: clientError('Nie można edytować lub anulować tej lekcji'),
			404: clientError('Lekcja nie znaleziona'),
			409: clientError(
				'Kolizja terminu, pojazdu albo zmiana lekcji od jej odczytu',
			),
		}),
	});
}
