import type { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import {
	assignStudentsBodySchema,
	clientError,
	createInstructorEventBodySchema,
	eligibleStudentsQuerySchema,
	eventIdAndStudentUserParamsSchema,
	eventIdParamsSchema,
	getEventQuerySchema,
	instructorEventDtoSchema,
	okDataSchema,
	okDataUnknown,
	patchInstructorEventBodySchema,
	replaceEventStudentsBodySchema,
	stdBearerResponses,
	z,
} from './shared';

export function registerEventPaths(registry: OpenAPIRegistry): void {
	// ── Events ────────────────────────────────────────────────────────────────
	registry.registerPath({
		method: 'post',
		path: '/events',
		tags: ['Events'],
		summary: 'Tworzenie wydarzenia instruktora (MANAGER)',
		description:
			'Dla THEORY opcjonalne `courseId` wiąże event z kursem; instruktor musi mieć uprawnienie do kategorii tego kursu. Uczestników (`event_participants`) trzeba dodać osobno przez POST/PUT `/events/{id}/students` — przy tworzeniu lista jest pusta.',
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
			201: okDataSchema(
				'Utworzone wydarzenie (data.event, pola m.in. capacity)',
				z.object({ event: instructorEventDtoSchema }),
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
			200: okDataSchema(
				'Event (data.event: instructor + students, opcjonalnie freeWindows)',
				z.object({ event: instructorEventDtoSchema }),
			),
		}),
	});

	registry.registerPath({
		method: 'patch',
		path: '/events/{id}',
		tags: ['Events'],
		summary: 'Edycja wydarzenia instruktora (MANAGER)',
		description:
			'Częściowy update (PATCH). Przy zmianie czasu lub instruktora: walidacja dostępności i kolizji; edytowany event jest wykluczany z nakładania na siebie; przy istniejących uczestnikach — brak kolizji ich grafiku z nowym oknem. Jeśli event THEORY ma courseId i zmienia się instruktor lub typ, instruktor musi mieć uprawnienie do kategorii kursu. Szczegóły: context/events-schedule-api.md',
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
			200: okDataSchema(
				'Zaktualizowane wydarzenie (data.event, pola m.in. capacity)',
				z.object({ event: instructorEventDtoSchema }),
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
}
