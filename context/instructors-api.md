---
description: "API — instruktorzy (/instructors): list, szczegóły, PATCH, DELETE (soft), role, kody odpowiedzi"
alwaysApply: true
---

# Instructors — API

Montowanie w `src/server.ts` pod prefiksem **`/instructors`**.

Implementacja: `src/routes/instructors.routes.ts`, `src/controllers/instructors.controller.ts`, `src/services/instructor.service.ts`, walidacja body PATCH: `src/lib/validation/instructorAdminPatch.ts`.

## Uwierzytelnianie i autoryzacja

- Nagłówek **`Authorization: Bearer <access_token>`** (jak przy `GET /auth/me`).
- Wszystkie trasy: **`authMiddleware`** + **`requireMinRole('MANAGER')`** (w praktyce MANAGER lub ADMIN — STUDENT / INSTRUCTOR nie przechodzą).

Szczegóły sesji: [auth.md](./auth.md).

## Trasy

| Metoda | Ścieżka | Opis |
|--------|---------|------|
| GET | `/instructors?schoolId=<uuid>` | Lista instruktorów przypisanych do szkoły (tylko aktywni `User`). Dostęp: właściciel OSK lub ADMIN. |
| GET | `/instructors/:id` | Szczegóły instruktora. Dostęp: właściciel co najmniej jednej OSK powiązanej z profilem instruktora; inaczej **403**. |
| PATCH | `/instructors/:id` | Częściowa aktualizacja profilu. **MANAGER:** ten sam zakres co GET (własna OSK). **ADMIN:** dowolny aktywny instruktor (`INSTRUCTOR`, `isActive`, bez `deletedAt`). |
| DELETE | `/instructors/:id` | Soft delete: ustawia `users.is_active = false` dla konta instruktora (bez usuwania z Supabase Auth). **MANAGER** jak PATCH (własna OSK); **ADMIN** — dowolny aktywny instruktor. **204** bez body. |

Wszystkie zapytania listujące / odczyt / zapis traktują jako „istniejącego” instruktora tylko powiąznego **aktywnego** użytkownika (`role` = `INSTRUCTOR`, `is_active`, brak `deleted_at`).

## PATCH — body (JSON)

Dozwolone (wszystkie opcjonalne; brak pól lub `{}` → no-op, **200** z bieżącym stanem):

| Pole | Typ | Walidacja |
|------|-----|-----------|
| `firstName` | string | jeśli obecne: po trim min. 1 znak |
| `lastName` | string | jak wyżej |
| `experienceYears` | number | jeśli obecne: liczba całkowita 0–80 |
| `qualifications` | string | jeśli obecne: string (może być pusty `""`) |

**Nieznane klucze** w body są **usuwane** (Zod `.strip()`), nie powodują **400**.

Prisma **nigdy** nie dostaje surowego `req.body` — tylko zwhitelistowane pola z serwisu.

## PATCH — odpowiedź (200)

`data`: `id`, `firstName`, `lastName`, `email`, `experienceYears`, `qualifications` (`string | null`).

## GET szczegółów — dodatkowe pola

Oprócz powyższych (w szerszym kształcie): `userId`, `phone`, `licenseNumber`, `schoolIds`, `qualifications`.

## Kody błędów

| Kod | Sytuacja |
|-----|----------|
| **401** | Brak / niepoprawny JWT (`authMiddleware`) |
| **403** | Rola poniżej MANAGER; MANAGER bez powiązania instruktora z własną OSK (GET / PATCH / DELETE); konto wyłączone (middleware auth) |
| **400** | Niepoprawny `schoolId` (lista); niepoprawny UUID `:id`; niepoprawne body PATCH (np. pusty `firstName` po trim, `experienceYears` spoza zakresu) |
| **404** | Brak profilu; użytkownik nie jest aktywnym instruktorem (GET / PATCH / DELETE jak „not found”; powtórny DELETE po dezaktywacji też **404**) |

## Migracje

Po dodaniu kolumny `qualifications` na `instructor_profiles` uruchom migracje / `prisma migrate` oraz **`prisma generate`**, żeby typy klienta były spójne ze schematem.

---

## Checklist smoke (ręczna)

1. **PATCH MANAGER:** `lastName` tylko → **200**, zmiana w DB; ten sam użytkownik, inny instruktor nie z własnej OSK → **403**.
2. **PATCH ADMIN:** dowolny aktywny instruktor → **200**; nieistniejący UUID → **404**; wyłączony instruktor → **404**.
3. **PATCH:** body `{}` → **200**, brak zmian w DB.
4. **PATCH:** nadmiarowe pole `email` w JSON → **200** (pole odrzucone przez strip), email bez zmian.
5. **PATCH:** `firstName: ""` lub same spacje → **400**.
6. **GET /:id:** odpowiedź zawiera `qualifications` (null lub tekst).
7. **DELETE MANAGER:** instruktor ze swojej OSK → **204**; bez powiązania → **403**; po DELETE GET → **404**.
8. **DELETE ADMIN:** aktywny instruktor → **204**; już wyłączony → **404**.

---

---

# Instructor Availability — API

Podmontowane jako sub-router pod **`/instructors/:instructorId/availability`**.

Implementacja:
- `src/routes/instructor-availability.routes.ts`
- `src/controllers/instructor-availability.controller.ts`
- `src/services/instructor-availability.service.ts`
- `src/schemas/instructor-availability.schemas.ts`

## Uwierzytelnianie i autoryzacja

- Wszystkie trasy: **`authMiddleware`** + **`requireMinRole('MANAGER')`**.
- **MANAGER** — dostęp tylko do instruktorów powiązanych z jego OSK (sprawdzane przez `instructorSchool`).
- **ADMIN** — dostęp do dowolnego aktywnego instruktora.
- `instructorId` w parametrze to UUID `InstructorProfile.id` (nie `User.id`).

## Trasy — tygodniowy wzorzec

| Metoda | Ścieżka | Opis |
|--------|---------|------|
| GET | `/instructors/:instructorId/availability/weekly` | Lista wszystkich wpisów tygodniowych instruktora (posortowane wg `dayOfWeek`). |
| PUT | `/instructors/:instructorId/availability/weekly/:dayOfWeek` | Upsert dnia tygodnia (0=niedziela … 6=sobota). |
| DELETE | `/instructors/:instructorId/availability/weekly/:dayOfWeek` | Usuwa wpis dla danego dnia. **204** bez body. |

### PUT `/weekly/:dayOfWeek` — body (JSON)

| Pole | Typ | Walidacja |
|------|-----|-----------|
| `startTime` | string | wymagane, format `HH:mm` (00:00–23:59) |
| `endTime` | string | wymagane, format `HH:mm`; musi być > `startTime` |

### GET `/weekly` — odpowiedź (200)

```json
{
  "success": true,
  "data": {
    "weekly": [
      { "id": "<uuid>", "dayOfWeek": 1, "startTime": "08:00", "endTime": "16:00" },
      { "id": "<uuid>", "dayOfWeek": 3, "startTime": "10:00", "endTime": "18:00" }
    ]
  }
}
```

### PUT `/weekly/:dayOfWeek` — odpowiedź (200)

```json
{
  "success": true,
  "data": {
    "entry": { "id": "<uuid>", "dayOfWeek": 1, "startTime": "08:00", "endTime": "16:00" }
  }
}
```

## Trasy — wyjątki per data

| Metoda | Ścieżka | Opis |
|--------|---------|------|
| GET | `/instructors/:instructorId/availability/exceptions?from=YYYY-MM-DD&to=YYYY-MM-DD` | Lista wyjątków w przedziale dat (włącznie). |
| PUT | `/instructors/:instructorId/availability/exceptions/:date` | Upsert wyjątku dla konkretnej daty (format: `YYYY-MM-DD`). |
| DELETE | `/instructors/:instructorId/availability/exceptions/:date` | Usuwa wyjątek. **204** bez body. |

### PUT `/exceptions/:date` — body (JSON)

| Pole | Typ | Walidacja |
|------|-----|-----------|
| `isDayOff` | boolean | wymagane |
| `startTime` | string | wymagane gdy `isDayOff = false`; format `HH:mm` |
| `endTime` | string | wymagane gdy `isDayOff = false`; format `HH:mm`; musi być > `startTime` |

**Reguła:** `isDayOff = true` → cały dzień zablokowany; `startTime`/`endTime` ignorowane (można pominąć).
**Reguła:** `isDayOff = false` → brak `startTime` lub `endTime` → **400**.

### GET `/exceptions` — odpowiedź (200)

```json
{
  "success": true,
  "data": {
    "exceptions": [
      { "id": "<uuid>", "date": "2026-05-01", "isDayOff": true, "startTime": null, "endTime": null },
      { "id": "<uuid>", "date": "2026-05-10", "isDayOff": false, "startTime": "09:00", "endTime": "13:00" }
    ]
  }
}
```

## Trasa — obliczona dostępność

| Metoda | Ścieżka | Opis |
|--------|---------|------|
| GET | `/instructors/:instructorId/availability/compute?date=YYYY-MM-DD` | Zwraca wolne okna czasowe instruktora dla podanego dnia po uwzględnieniu wszystkich warstw. |

### Algorytm priorytetów:

```
1. InstructorLeave (urlop)      → { available: false, reason: "leave" }
2. InstructorWorkingHours (exception):
   a. isDayOff = true           → { available: false, reason: "day_off" }
   b. isDayOff = false + godziny → baseWindow = godziny z wyjątku
3. InstructorWorkingHoursDefault (weekly):
   → brak wpisu dla dayOfWeek  → { available: false, reason: "no_schedule" }
   → jest wpis                 → baseWindow = godziny tygodniowe
4. Odejmij InstructorTimeBlock (spotkania, przerwy)
5. Odejmij Lesson (status != CANCELLED)
6. Zwróć wolne okna
```

### GET `/compute` — odpowiedź (200) — instruktor dostępny

```json
{
  "success": true,
  "data": {
    "available": true,
    "windows": [
      { "start": "08:00", "end": "12:00" },
      { "start": "13:00", "end": "16:00" }
    ]
  }
}
```

### GET `/compute` — odpowiedź (200) — instruktor niedostępny

```json
{
  "success": true,
  "data": {
    "available": false,
    "reason": "leave"
  }
}
```

Możliwe wartości `reason`: `"leave"` | `"day_off"` | `"no_schedule"`

## Kody błędów (wszystkie trasy availability)

| Kod | Sytuacja |
|-----|----------|
| **401** | Brak / niepoprawny JWT |
| **403** | Rola poniżej MANAGER; MANAGER bez powiązania instruktora z własną OSK |
| **400** | Niepoprawny UUID `instructorId`; niepoprawny `dayOfWeek` (poza 0–6); niepoprawny format daty; brak wymaganych pól body; `startTime >= endTime`; `isDayOff = false` bez godzin; `from > to` w query |
| **404** | Instruktor nie istnieje lub nie jest aktywny; brak wpisu przy DELETE |

## Checklist smoke — availability (ręczna)

1. **GET /weekly** MANAGER swojego instruktora → **200**, lista `[]` przy pustym wzorcu.
2. **PUT /weekly/1** `{ startTime: "08:00", endTime: "16:00" }` → **200**, wpis zwrócony.
3. **PUT /weekly/1** ponownie z innymi godzinami → **200**, upsert (ten sam `id`).
4. **PUT /weekly/1** `{ startTime: "16:00", endTime: "08:00" }` → **400** (`startTime >= endTime`).
5. **DELETE /weekly/1** → **204**; ponowny DELETE → **404**.
6. **PUT /exceptions/2026-05-01** `{ isDayOff: true }` → **200**.
7. **PUT /exceptions/2026-05-10** `{ isDayOff: false }` (bez godzin) → **400**.
8. **PUT /exceptions/2026-05-10** `{ isDayOff: false, startTime: "09:00", endTime: "13:00" }` → **200**.
9. **GET /exceptions?from=2026-05-01&to=2026-05-31** → **200**, lista 2 wpisów.
10. **GET /compute?date=2026-05-01** (dzień z `isDayOff: true`) → `{ available: false, reason: "day_off" }`.
11. **GET /compute?date=2026-05-10** (exception z godzinami, bez bloków) → `{ available: true, windows: [{ start: "09:00", end: "13:00" }] }`.
12. **GET /weekly** MANAGER instruktora z innej OSK → **403**.
