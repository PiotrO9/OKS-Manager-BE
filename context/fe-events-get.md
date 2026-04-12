---
description: "FE — odczyt pojedynczego eventu instruktora (GET /events/:id)"
alwaysApply: false
---

# Pobranie eventu instruktora (`GET /events/:id`) — wymaganie dla FE / BFF

## Kontekst

Frontend (Nuxt BFF: `GET /api/events/:eventId` → proxy do upstreamu) wywołuje **`GET /events/:id`**, aby:

- wczytać formularz **edycji** bloku czasu (`/manager/events/:id/edit`),
- zwrócić **JSON** w standardowym envelope (jak `POST` / `PATCH`).

Bez tego endpointu upstream często zwraca **HTML** (np. strona 404), a klient dostaje błąd parsowania JSON — FE może wtedy tylko obejść to przez **`GET /schedule`** (wyszukanie wpisu `kind: instructor_event` w `items`), co jest kruche (zakres dat, `instructorId`).

## Co dodać na backendzie

| Element | Opis |
|--------|------|
| **Route** | `GET /events/:id` — `:id` = UUID `InstructorEvent` |
| **Auth** | `Authorization: Bearer <JWT>` (jak przy `PATCH /events/:id`) |
| **Rola** | min. **MANAGER** (ADMIN); MANAGER tylko w granicach swojej OSK względem **instruktora przypisanego do eventu** (ta sama logika co przy PATCH — np. `assertActorCanManageAvailability`) |
| **Odpowiedź sukcesu** | **200**, body **JSON** (`Content-Type: application/json`): `success: true`, `data: { event: InstructorEventDto, instructor: { id, firstName, lastName } }` — `event` jak po `POST`/`PATCH` (`instructorId` = `instructor.id`); `instructor` jak w schedule (`InstructorProfile.id` + imię/nazwisko) |
| **404** | Event nie istnieje — **JSON** z envelope błędu (nie strona HTML), spójnie z resztą API |
| **403** | Brak uprawnień do podglądu / zarządzania tym instruktorem |

## Kształt `event` (spójny z POST/PATCH)

Pola jak w istniejącym DTO: `id`, `instructorId`, `type` (`DRIVE` \| `THEORY`), `startTime`, `endTime`, `vehicleId`, `capacity`, `createdAt` — zgodnie z [events-schedule-api.md](./events-schedule-api.md) i [fe-events-patch.md](./fe-events-patch.md).

Dodatkowo **`instructor`** — wyświetlanie nazwiska w edycji bez drugiego zapytania; zgodne z polem `instructor` przy **`kind: instructor_event`** w `GET /schedule`.

## Uwagi implementacyjne

- **Nie zwracać HTML** na 404/500 — tylko JSON; inaczej BFF (`bffEventsGet`) nie sparsuje odpowiedzi.
- Warto dopisać **`GET /events/:id`** do [events-schedule-api.md](./events-schedule-api.md) w sekcji `/events` oraz w checklist smoke.

## Powiązane pliki (BE — orientacyjnie)

- `src/routes/events.routes.ts`
- `src/controllers/event.controller.ts`
- `src/services/event.service.ts` (np. `getInstructorEventById` / reuse odczytu jak przy update)
- `src/schemas/event.schemas.ts`

## Obejście bez GET (tylko dokumentacja)

Do **prefill** można teoretycznie użyć **`GET /schedule`** z `instructorId` + `dateFrom`/`dateTo` i znaleźć `items[].id === eventId` oraz `kind === 'instructor_event'` — to **nie zastępuje** dedykowanego `GET /events/:id` (inny kontrakt, dodatkowe parametry).
