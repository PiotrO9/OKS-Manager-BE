---
description: "API — lista OSK użytkownika (GET /driving-schools), role, kody odpowiedzi"
alwaysApply: true
---

# Driving schools (OSK) — API

Pierwszy domenowy endpoint poza `/auth`: **lista szkół jazdy dostępnych dla zalogowanego użytkownika** (MVP — bez paginacji, filtów i wyszukiwania).

Implementacja: `src/routes/driving-schools.routes.ts`, `src/controllers/driving-schools.controller.ts`, `src/services/oskContext.ts`, `src/schemas/driving-school.schemas.ts`; montowanie w `src/server.ts` pod prefiksem **`/driving-schools`**.

## Uwierzytelnianie

Wymagany nagłówek **`Authorization: Bearer <access_token>`** (ten sam token co przy `GET /auth/me`).

Middleware: **`authMiddleware`** (`src/middleware/auth.middleware.ts`) — walidacja JWT (Supabase) oraz załadowanie rekordu **`User`** z Prisma do kontekstu żądania.

Szczegóły sesji i logowania: [auth.md](./auth.md).

## Trasy (wybrane)

| Metoda | Ścieżka | Middleware | Opis |
|--------|---------|------------|------|
| GET | `/driving-schools` | `authMiddleware` | Zwraca listę szkół + `defaultOskId`; każdy element ma pola szkoły oraz **`enabledCourseKinds`**: tablica `CourseKind` zapisanych w `SchoolSettings` (ustawienia tworzone razem z OSK przy `POST`). |
| POST | `/driving-schools` | `authMiddleware`, `requireMinRole('MANAGER')` | Tworzy OSK. Body: `name` (wym.), opcjonalnie `city`, `address`, **`enabledCourseKinds`** — tablica unikalnych `THEORY_GROUP` \| `PRACTICAL` \| `EXTRA` (pusta dozwolona w zapisie); jeśli pole pominięte — domyślnie wszystkie trzy. Odpowiedź zawiera szkołę + **`enabledCourseKinds`**. |
| PATCH | `/driving-schools/:id` | `authMiddleware`, `requireMinRole('MANAGER')` | Częściowa aktualizacja: `name`, `city`, `address`, **`enabledCourseKinds`** (zastąpienie całej listy w `school_settings`; `upsert` jeśli brak rekordu). Przynajmniej jedno pole wymagane. |
| PATCH | `/driving-schools/:id/default-vehicle` | `authMiddleware`, `requireMinRole('MANAGER')` | Ustawia domyślny pojazd szkoły: body `{ "vehicleId": "<uuid>" }`. Sukces: `data: { defaultVehicleId }`. Pojazd musi istnieć, być aktywny (`isActive`) i należeć do tej szkoły; inna szkoła / obcy pojazd → **403**; brak pojazdu lub nieaktywny → **404** (jak przy `PATCH /vehicles/:id`). |

Pierwszy pojazd utworzony dla danej szkoły (`POST /vehicles` bez `id` w body, pierwszy rekord `vehicles` dla `schoolId`) ustawia automatycznie `defaultVehicleId` na szkole (transakcja), analogicznie do pierwszego OSK i `defaultOskId` użytkownika.

## Format odpowiedzi

Zgodnie z [api-guidelines.md](./api-guidelines.md) — koperta JSON:

- Sukces: `{ "success": true, "data": <DrivingSchool[]> }` — **`data` jest zawsze tablicą** (0 lub więcej elementów).
- Błąd: `{ "success": false, "error": "<tekst>" }`.

Model Prisma `DrivingSchool` odpowiada tabeli `driving_schools` (m.in. `id`, `name`, `city`, `address`, `ownerId`, `createdAt`). **`enabledCourseKinds`** pochodzą z powiązanych **`SchoolSettings`** (`school_settings.enabled_course_kinds`, typ `CourseKind[]` w Postgresie) i są zwracane **na poziomie DTO** (spłaszczone przy `GET`, `POST` utworzenia, `PATCH`, oraz przy `GET /driving-schools/default` obok **`settings`**).

Migracja inicjalizuje brakujące `school_settings` dla istniejących szkół i ustawia pełny zestaw trzech `CourseKind`.

## Logika wg roli

Powiązanie użytkownika z OSK w bazie **nie jest** polem `oskId` na `User`:

- **ADMIN** i **MANAGER** — szkoły, których **właścicielem** jest użytkownik: `driving_schools.owner_id = user.id`. Jedna osoba może mieć **wiele** takich szkół (`findMany`).
- **INSTRUCTOR** — szkoły z relacji M:N: `instructor_profiles` → `instructor_schools` → szkoła.
- **STUDENT** — szkoły z relacji M:N: `student_profiles` → `student_schools` → szkoła.

Inne role (np. nieobsługiwana wartość) → odpowiedź **403**.

Żaden klient nie dostaje szkół „obcych”: filtrowanie jest po `owner_id` lub po powiązaniach profilu z jednym kontem.

## Kody HTTP (skrót)

| Kod | Kiedy |
|-----|--------|
| **200** | Poprawna odpowiedź; `data` może być pustą tablicą (np. brak przypisanych szkół przy poprawnym profilu / właścicielu). |
| **401** | Brak/nieprawidłowy token, użytkownik nie znaleziony w DB po walidacji JWT — zwykle z `authMiddleware`. |
| **404** | Rola INSTRUCTOR lub STUDENT, a w bazie **brak** odpowiednio `InstructorProfile` lub `StudentProfile` dla `user.id`. |
| **403** | Rola spoza obsługiwanych ścieżek (np. nieznana / nieprzewidziana w controllerze). |

## MVP — poza zakresem

- Paginacja, sortowanie po query, filtry, full-text search.
- Osobne endpointy CRUD pod jedną szkołę (np. `GET /driving-schools/:id`).
- Zmiana modelu bazy wyłącznie na potrzeby tej trasy.

## Powiązania w dokumentacji domeny

- CRUD pojazdów i upload zdjęć: [vehicles-api.md](./vehicles-api.md).
- Model relacji OSK ↔ użytkownicy: [system-overview.md](./system-overview.md) (sekcje users, driving schools, school assignments).
