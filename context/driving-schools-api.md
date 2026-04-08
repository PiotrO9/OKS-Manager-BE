---
description: "API — lista OSK użytkownika (GET /driving-schools), role, kody odpowiedzi"
alwaysApply: true
---

# Driving schools (OSK) — API

Pierwszy domenowy endpoint poza `/auth`: **lista szkół jazdy dostępnych dla zalogowanego użytkownika** (MVP — bez paginacji, filtów i wyszukiwania).

Implementacja: `src/routes/driving-schools.routes.ts`, `src/controllers/driving-schools.controller.ts`, `src/services/oskContext.ts`, `src/schemas/driving-school.schemas.ts`; montowanie w `src/server.ts` pod prefiksem **`/driving-schools`**.

Słownik kategorii prawa jazdy (A, B, C, …): `GET /course-types` — `src/routes/course-types.routes.ts`, `src/controllers/course-types.controller.ts`.

## Uwierzytelnianie

Wymagany nagłówek **`Authorization: Bearer <access_token>`** (ten sam token co przy `GET /auth/me`).

Middleware: **`authMiddleware`** (`src/middleware/auth.middleware.ts`) — walidacja JWT (Supabase) oraz załadowanie rekordu **`User`** z Prisma do kontekstu żądania.

Szczegóły sesji i logowania: [auth.md](./auth.md).

## Trasy (wybrane)

| Metoda | Ścieżka | Middleware | Opis |
|--------|---------|------------|------|
| GET | `/driving-schools` | `authMiddleware` | Zwraca listę szkół + `defaultOskId`; każdy element ma **`enabledCourseKinds`** i **`offeredCourseTypes`** (z `SchoolSettings`) albo **puste tablice**, jeśli rekordu `school_settings` jeszcze nie ma. |
| POST | `/driving-schools` | `authMiddleware`, `requireMinRole('MANAGER')` | Tworzy OSK. Body: `name` (wym.), opcjonalnie `city`, `address`. **Nie** tworzy `SchoolSettings` ani nie przyjmuje pól ustawień. Odpowiedź: szkoła + **`enabledCourseKinds: []`**, **`offeredCourseTypes: []`**. |
| PATCH | `/driving-schools/:id` | `authMiddleware`, `requireMinRole('MANAGER')` | Częściowa aktualizacja: `name`, `city`, `address`, **`enabledCourseKinds`** (zastąpienie całej listy `CourseKind`), **`offeredCourseTypeIds`** (tablica UUID z `course_types` — **zastąpienie** całej listy powiązań oferowanych kategorii; `[]` czyści listę). `school_settings`: **`upsert`** po `schoolId`. Przynajmniej jedno pole wymagane. Przy **pierwszym** utworzeniu ustawień, jeśli body nie zawiera `enabledCourseKinds`, zapisana zostanie **pusta** lista kinds (do uzupełnienia kolejnym PATCH). Nieistniejący UUID w `offeredCourseTypeIds` → **400** (`Invalid offeredCourseTypeIds`). |
| GET | `/course-types` | `authMiddleware`, `requireMinRole('MANAGER')` | Katalog **`CourseType`**: `{ courseTypes: [{ id, code, name }] }` posortowane po `code` (multi-select w panelu OSK). |
| PATCH | `/driving-schools/:id/default-vehicle` | `authMiddleware`, `requireMinRole('MANAGER')` | Ustawia domyślny pojazd szkoły: body `{ "vehicleId": "<uuid>" }`. Sukces: `data: { defaultVehicleId }`. Pojazd musi istnieć, być aktywny (`isActive`) i należeć do tej szkoły; inna szkoła / obcy pojazd → **403**; brak pojazdu lub nieaktywny → **404** (jak przy `PATCH /vehicles/:id`). |

Pierwszy pojazd utworzony dla danej szkoły (`POST /vehicles` bez `id` w body, pierwszy rekord `vehicles` dla `schoolId`) ustawia automatycznie `defaultVehicleId` na szkole (transakcja), analogicznie do pierwszego OSK i `defaultOskId` użytkownika.

## Format odpowiedzi

Zgodnie z [api-guidelines.md](./api-guidelines.md) — koperta JSON:

- Sukces: `{ "success": true, "data": <DrivingSchool[]> }` — **`data` jest zawsze tablicą** (0 lub więcej elementów).
- Błąd: `{ "success": false, "error": "<tekst>" }`.

Model Prisma `DrivingSchool` odpowiada tabeli `driving_schools` (m.in. `id`, `name`, `city`, `address`, `ownerId`, `createdAt`). **`enabledCourseKinds`** i **`offeredCourseTypes`** pochodzą z powiązanych **`SchoolSettings`** i są zwracane **na poziomie DTO** (spłaszczone przy `GET` liście, `POST` utworzenia, `PATCH`). **`offeredCourseTypes`**: `{ id, code, name }[]` (relacja M:N `SchoolSettings` ↔ `CourseType`).

**`GET /driving-schools/default`**: oprócz pól szkoły — `enabledCourseKinds`, `offeredCourseTypes`, **`settings`** (skalary `SchoolSettings` **bez** zagnieżdżonej listy typów, żeby uniknąć duplikacji; pełna lista oferty jest w `offeredCourseTypes` na root).

Migracja historyczna zapełniła `school_settings` dla istniejących szkół; **nowe** OSK nie mają rekordu ustawień do pierwszego `PATCH` z polami ustawień.

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
