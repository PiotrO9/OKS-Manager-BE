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
| GET | `/driving-schools` | `authMiddleware` | Zwraca listę `DrivingSchool` widocznych dla roli użytkownika |
| PATCH | `/driving-schools/:id/default-vehicle` | `authMiddleware`, `requireMinRole('MANAGER')` | Ustawia domyślny pojazd szkoły: body `{ "vehicleId": "<uuid>" }`. Sukces: `data: { defaultVehicleId }`. Pojazd musi istnieć, być aktywny (`isActive`) i należeć do tej szkoły; inna szkoła / obcy pojazd → **403**; brak pojazdu lub nieaktywny → **404** (jak przy `PATCH /vehicles/:id`). |

Pierwszy pojazd utworzony dla danej szkoły (`POST /vehicles` bez `id` w body, pierwszy rekord `vehicles` dla `schoolId`) ustawia automatycznie `defaultVehicleId` na szkole (transakcja), analogicznie do pierwszego OSK i `defaultOskId` użytkownika.

## Format odpowiedzi

Zgodnie z [api-guidelines.md](./api-guidelines.md) — koperta JSON:

- Sukces: `{ "success": true, "data": <DrivingSchool[]> }` — **`data` jest zawsze tablicą** (0 lub więcej elementów).
- Błąd: `{ "success": false, "error": "<tekst>" }`.

Model Prisma `DrivingSchool` odpowiada tabeli `driving_schools` (m.in. `id`, `name`, `city`, `address`, `ownerId`, `createdAt`).

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
