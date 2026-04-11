---
description: "API — lista OSK użytkownika (GET /driving-schools), sloty agregowane availability, role, kody odpowiedzi"
alwaysApply: true
---

# Driving schools (OSK) — API

Pierwszy domenowy endpoint poza `/auth`: **lista szkół jazdy dostępnych dla zalogowanego użytkownika** (MVP — bez paginacji, filtów i wyszukiwania).

Implementacja: `src/routes/driving-schools.routes.ts`, `src/controllers/driving-schools.controller.ts`, `src/services/oskContext.ts`, `src/schemas/driving-school.schemas.ts`; montowanie w `src/server.ts` pod prefiksem **`/driving-schools`**. Sloty agregowane: `src/services/school-availability.service.ts`, `src/schemas/school-availability.schemas.ts`.

Słownik kategorii prawa jazdy (A, B, C, …): `GET /course-types` — `src/routes/course-types.routes.ts`, `src/controllers/course-types.controller.ts`.

## Uwierzytelnianie

Wymagany nagłówek **`Authorization: Bearer <access_token>`** (ten sam token co przy `GET /auth/me`).

Middleware: **`authMiddleware`** (`src/middleware/auth.middleware.ts`) — walidacja JWT (Supabase) oraz załadowanie rekordu **`User`** z Prisma do kontekstu żądania.

Szczegóły sesji i logowania: [auth.md](./auth.md).

## Trasy (wybrane)

| Metoda | Ścieżka | Middleware | Opis |
|--------|---------|------------|------|
| GET | `/driving-schools` | `authMiddleware` | Zwraca listę szkół + `defaultOskId`; każdy element ma **`enabledCourseKinds`** i **`offeredCourseTypes`** (z `SchoolSettings`) albo **puste tablice**, jeśli rekordu `school_settings` jeszcze nie ma. |
| GET | `/driving-schools/:id/availability/slots` | `authMiddleware` | **Sloty dostępności** wielu instruktorów szkoły w jednym żądaniu (filtry query); szczegóły poniżej i w [instructors-api.md](./instructors-api.md) (sekcja „Sloty agregowane”). |
| POST | `/driving-schools` | `authMiddleware`, `requireMinRole('MANAGER')` | Tworzy OSK. Body: `name` (wym.), opcjonalnie `city`, `address`. **Nie** tworzy `SchoolSettings` ani nie przyjmuje pól ustawień. Odpowiedź: szkoła + **`enabledCourseKinds: []`**, **`offeredCourseTypes: []`**. |
| PATCH | `/driving-schools/:id` | `authMiddleware`, `requireMinRole('MANAGER')` | Częściowa aktualizacja: `name`, `city`, `address`, **`enabledCourseKinds`** (zastąpienie całej listy `CourseKind`), **`offeredCourseTypeIds`** (tablica UUID z `course_types` — **zastąpienie** całej listy powiązań oferowanych kategorii; `[]` czyści listę). `school_settings`: **`upsert`** po `schoolId`. Przynajmniej jedno pole wymagane. Przy **pierwszym** utworzeniu ustawień, jeśli body nie zawiera `enabledCourseKinds`, zapisana zostanie **pusta** lista kinds (do uzupełnienia kolejnym PATCH). Nieistniejący UUID w `offeredCourseTypeIds` → **400** (`Invalid offeredCourseTypeIds`). |
| GET | `/course-types` | `authMiddleware`, `requireMinRole('MANAGER')` | Katalog **`CourseType`**: `{ courseTypes: [{ id, code, name }] }` posortowane po `code` (multi-select w panelu OSK). |
| PATCH | `/driving-schools/:id/default-vehicle` | `authMiddleware`, `requireMinRole('MANAGER')` | Ustawia domyślny pojazd szkoły: body `{ "vehicleId": "<uuid>" }`. Sukces: `data: { defaultVehicleId }`. Pojazd musi istnieć, być aktywny (`isActive`) i należeć do tej szkoły; inna szkoła / obcy pojazd → **403**; brak pojazdu lub nieaktywny → **404** (jak przy `PATCH /vehicles/:id`). |

Pierwszy pojazd utworzony dla danej szkoły (`POST /vehicles` bez `id` w body, pierwszy rekord `vehicles` dla `schoolId`) ustawia automatycznie `defaultVehicleId` na szkole (transakcja), analogicznie do pierwszego OSK i `defaultOskId` użytkownika.

## GET `/driving-schools/:id/availability/slots` — sloty agregowane

Zwraca **listę wolnych slotów** (ta sama logika co `GET /instructors/:instructorId/availability/slots`, ale dla wielu instruktorów naraz) z polami identyfikującymi instruktora.

**Autoryzacja:** tylko `authMiddleware` (bez `requireMinRole`). Dostęp: **ADMIN** (nieusunięta OSK), **MANAGER** (właściciel `:id`), **STUDENT** / **INSTRUCTOR** — tylko jeśli profil jest przypisany do tej szkoły (`StudentSchool` / `InstructorSchool`). Inaczej **403**; nieistniejąca lub usunięta szkoła → **404**.

**Query — wymagane:** `dateFrom`, `dateTo` (`YYYY-MM-DD`), ten sam limit **30 dni** kalendarzowych (włącznie) co przy slotach per instruktor.

**Query — opcjonalne (skrót):**

| Parametr | Opis |
|----------|------|
| `instructorIds` | Jedna lub wiele wartości UUID (powtórzone klucze lub lista rozdzielona przecinkiem); każdy musi być instruktorem przypisanym do tej OSK — inaczej **400**. |
| `timeFrom`, `timeTo` | `HH:mm` — slot musi **w całości** leżeć w oknie (start ≥ `timeFrom`, koniec ≤ `timeTo`). |
| `weekdays` | Numery dni 0–6 (UTC, niedziela = 0), lista rozdzielona przecinkiem. |
| `slotDurationMinutes` | 15–240; domyślnie z `SchoolSettings.slotDurationMinutes` (fallback 60). |
| `courseId` | Kurs należący do tej szkoły; jeśli kurs ma `instructorId`, wynik tylko dla tego instruktora. **STUDENT** musi być uczestnikiem kursu — inaczej **403**. |
| `lessonType` | `THEORY` \| `PRACTICE` — zaakceptowany w API; **MVP bez wpływu** na wynik (zarezerwowane). |
| `sort` | `startTime` (domyślnie) lub `instructorName`. |
| `limit` | Domyślnie **200**, max **500**. |
| `offset` | Domyślnie **0**. |
| `excludeMyLessons` | Dla **STUDENT** domyślnie `true`: pomija sloty nakładające się na własne lekcje (`Lesson` ≠ `CANCELLED`). |

**Reguły biznesowe dat:** skuteczny koniec zakresu nie przekracza **`bookingMaxDaysAhead`** z `SchoolSettings` (względem „dziś” UTC). Dla **STUDENT** początek zakresu nie może być wcześniejszy niż bieżąca data UTC (podnoszenie `dateFrom`).

**Odpowiedź (200):** `{ "success": true, "data": { "slots": [...], "total": <number> } }` — `total` to liczba slotów **po filtrach**, przed `limit`/`offset`. Element `slots[]`: `instructorId`, `instructorFirstName`, `instructorLastName`, `date`, `startTime`, `endTime`.

**Błędy:** **400** — walidacja query (daty, UUID, `timeFrom` ≥ `timeTo`); **403** — brak dostępu do szkoły / kursu; **404** — brak szkoły lub (przy `courseId`) brak kursu w tej szkole.

OpenAPI: tag **Driving schools**, schemat `schoolAvailabilitySlotsQuerySchema`. Algorytm slotu (urlop, wyjątki, grafik, odejmowanie lekcji i bloków): [instructors-api.md](./instructors-api.md).

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
