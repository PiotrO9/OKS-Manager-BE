---
description: "API — kursanci (/students): lista z paginacją i filtrem kursu, szczegóły z kursami, notatki (`notes`), statusem uczestnictwa (enum ACTIVE/FINISHED), przypisanie OSK, PKK, wpis na kurs, PATCH statusu uczestnictwa — role, kody odpowiedzi"
alwaysApply: true
---

# Studenci — API

Montowanie w `src/server.ts` pod prefiksem **`/students`**.

Implementacja: `src/routes/students.routes.ts`, `src/controllers/students.controller.ts`, `src/services/students.service.ts`, walidacja w `src/lib/validation/uuid.ts` m.in.: `listStudentsQuerySchema`, `studentDetailParamsSchema`, `studentDetailQuerySchema`, **`patchStudentBodySchema`**, **`studentCourseParamsSchema`**, **`patchCourseParticipantStatusBodySchema`** (`courseParticipantStatusSchema`).

Operacje **PATCH** (OSK, PKK) i przypisanie do kursu opisuje też [auth.md](./auth.md) (sekcje studenci).

## Uwierzytelnianie

- Nagłówek **`Authorization: Bearer <access_token>`** (jak przy `GET /auth/me`).

Szczegóły sesji: [auth.md](./auth.md).

## Trasy

| Metoda | Ścieżka | Middleware (skrót) | Opis |
|--------|---------|--------------------|------|
| GET | `/students` | `authMiddleware`, `requireMinRole('INSTRUCTOR')` | Paginowana lista kursantów w OSK; opcjonalnie filtr po kursie. |
| GET | `/students/:userId` | `authMiddleware`, `requireMinRole('STUDENT')` | Szczegóły kursanta (`users.id` w ścieżce) z **`notes`**, listą kursów w OSK i `status` z **`course_participants`**. |
| PATCH | `/students/:userId` | `requireMinRole('INSTRUCTOR')` | Aktualizacja **`student_profiles.notes`** (body z polem **`notes`**) — reguły jak przy PKK — [auth.md](./auth.md). |
| PATCH | `/students/:userId/driving-school` | `requireMinRole('MANAGER')` | Przypisanie / zmiana OSK — [auth.md](./auth.md). |
| PATCH | `/students/:userId/pkk` | `requireMinRole('INSTRUCTOR')` | PKK — [auth.md](./auth.md). |
| POST | `/students/:userId/courses` | `requireMinRole('INSTRUCTOR')` | Uczestnictwo w kursie (`course_participants`); domyślny **`status`** = **`ACTIVE`**. |
| PATCH | `/students/:userId/courses/:courseId/status` | `requireMinRole('INSTRUCTOR')` | Ręczna zmiana **`course_participants.status`** (`ACTIVE` \| `FINISHED`); reguły OSK jak przy POST na kurs. |

---

## Status uczestnictwa w kursie (`course_participants.status`)

- W bazie i w Prisma: enum **`CourseParticipantStatus`** — wartości: **`ACTIVE`** (domyślna przy utworzeniu rekordu), **`FINISHED`**.
- **MVP:** brak automatycznej zmiany statusu (np. po liczbie jazd); wyłącznie **ręczna** aktualizacja przez endpoint **PATCH** (personel z uprawnieniami do OSK kursu).
- Niepoprawna wartość w body → **400** (walidacja Zod). Brak wpisu uczestnictwa (para kursant + kurs) → **404**.

---

## GET `/students` — query

| Parametr | Wymagane | Domyślnie | Uwagi |
|----------|----------|-----------|--------|
| `schoolId` | tak | — | UUID aktywnej OSK (`driving_schools.deleted_at IS NULL`). |
| `page` | nie | `1` | Liczba całkowita ≥ 1. |
| `limit` | nie | `20` | Liczba całkowita 1–100 (powyżej → **400**). |
| `courseId` | nie | — | UUID kursu; jeśli podane, tylko kursanci z wpisem w **`course_participants`** dla tego kursu. Kurs musi należeć do **tej samej** `schoolId` i mieć `deletedAt` null — inaczej **404** `Course not found`. |

Powtórzony klucz w query jest jak w innych endpointach: pierwsza wartość (preprocess w Zod).

## Autoryzacja (lista)

- **`ADMIN`:** dostęp bez sprawdzania właścicielstwa OSK (lista według `schoolId` w query).
- **`MANAGER`:** tylko gdy `schoolId` wskazuje OSK, której użytkownik jest **w źródle `driving_schools.owner_id`** — inaczej **403**.
- **`INSTRUCTOR`:** tylko gdy istnieje powiązanie **`instructor_schools`** dla tego użytkownika i podanej `schoolId` (aktywna szkoła) — inaczej **403**.

`STUDENT` nie przechodzi `requireMinRole('INSTRUCTOR')`.

## Logika listy

- Zakres: profile **`student_profiles`** z co najmniej jednym **`student_schools`** dla danej `schoolId` (aktywna szkoła).
- Użytkownicy z **`users.deleted_at`** ustawionym są wykluczeni.
- Sortowanie (stabilne dla paginacji): **`users.last_name` rosnąco**, potem **`users.first_name` rosnąco**.
- **`total`** liczone osobnym zapytaniem w tej samej transakcji co `findMany` (spójny zbiór w filtrach).

## Sukces (200) — kształt `data`

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "<student_profile_id>",
        "userId": "<users.id>",
        "firstName": "...",
        "lastName": "...",
        "email": "...",
        "phone": null,
        "pkkNumber": null,
        "isActive": true,
        "createdAt": "<ISO>"
      }
    ],
    "total": 0,
    "page": 1,
    "limit": 20
  }
}
```

Pusta strona (np. `page` poza zakresem): `data: []`, `total` — pełna liczba rekordów spełniających filtry.

Brak osobnego N+1 dla kursów: lista nie dołącza wszystkich kursów kursanta (MVP).

---

## GET `/students/:userId` — query

| Parametr | Wymagane | Uwagi |
|----------|----------|--------|
| `schoolId` | tak | UUID OSK; kursant musi mieć **`student_schools`** dla tej szkoły (aktywna, `deleted_at` null). |

**`:userId`** — `users.id` kursanta (ten sam identyfikator co w innych trasach `/students/:userId/*`).

## Autoryzacja (szczegóły)

- **`STUDENT`:** tylko **własny** profil (`:userId` = `req.user.id`); inny `userId` → **403**.
- **`INSTRUCTOR` / `MANAGER`:** ta sama reguła co przy liście dla danej `schoolId` (instruktor — `instructor_schools`; manager — `driving_schools.owner_id`).
- **`ADMIN`:** dostęp bez sprawdzania właścicielstwa OSK (filtrowanie po `schoolId` w query).

## Logika szczegółów

- Jedno zapytanie Prisma: `student_profiles` + `course_participants` z powiązanym `course` (tylko kursy należące do podanej OSK i z `deleted_at` null).
- Kursant bez wpisów na kursy w tej OSK → `courses: []`.
- Brak profilu kursanta lub brak przypisania do podanej OSK → **404** `Student not found` (oraz gdy użytkownik w `where` nie pasuje — np. wykluczenie przez `users.deleted_at`).

Pole **`status`** w każdym elemencie `courses[]` pochodzi z **`course_participants.status`** (enum: **`ACTIVE`** \| **`FINISHED`**).

## Sukces (200) — kształt `data`

```json
{
  "success": true,
  "data": {
    "id": "<student_profile_id>",
    "userId": "<users.id>",
    "firstName": "...",
    "lastName": "...",
    "email": "...",
    "pkkNumber": null,
    "notes": null,
    "courses": [
      {
        "id": "<course_id>",
        "name": "...",
        "category": "...",
        "status": "ACTIVE"
      }
    ]
  }
}
```

(`"status"` może być także `"FINISHED"`.)

## PATCH `/students/:userId` — notatki

**Middleware:** `authMiddleware`, **`requireMinRole('INSTRUCTOR')`** ( **`INSTRUCTOR`**, **`MANAGER`**, **`ADMIN`**; **`STUDENT`** → **403**).

**Body (JSON):** `{ "notes": string | null }` — pole **`notes`** wymagane. Pusty string / same spacje → zapis jako **`null`**. Maks. **5000** znaków — inaczej **400**.

**Autoryzacja:** ta sama co **`PATCH /students/:userId/pkk`** (`assertActorCanPatchStudentPkk`).

## Sukces (200) — kształt `data`

```json
{
  "success": true,
  "data": {
    "userId": "<users.id>",
    "notes": null
  }
}
```

## PATCH `/students/:userId/courses/:courseId/status`

**Middleware:** `authMiddleware`, **`requireMinRole('INSTRUCTOR')`** — w praktyce **`INSTRUCTOR`**, **`MANAGER`** ( **`ADMIN`** otrzyma **403**, spójnie z przypisaniem na kurs).

**Parametry ścieżki:** **`:userId`** — `users.id` kursanta; **`:courseId`** — `courses.id`.

**Body (JSON):** `{ "status": "ACTIVE" | "FINISHED" }` — inna wartość / brak pola → **400**.

## Autoryzacja (zmiana statusu)

Ta sama logika co przy **`POST /students/:userId/courses`**: kurs istnieje i nie jest soft-delete; kursant ma **`student_schools`** dla szkoły tego kursu; **`MANAGER`** — wyłącznie właściciel **`driving_schools`** dla `course.schoolId`; **`INSTRUCTOR`** — wpis **`instructor_schools`** dla tej szkoły. Brak spełnienia warunków → **403**. Kursant nie jest uczestnikiem danego kursu → **404** `Student is not enrolled in this course`.

## Sukces (200) — kształt `data`

```json
{
  "success": true,
  "data": {
    "participant": {
      "id": "<course_participants.id>",
      "courseId": "<courses.id>",
      "studentId": "<student_profiles.id>",
      "status": "FINISHED"
    }
  }
}
```

## Błędy (PATCH status — typowe)

| Kod | Sytuacja |
|-----|----------|
| **400** | Nieprawidłowy `:userId`, `:courseId` lub body (`status` poza dozwolonym zbiorem). |
| **401** | Brak lub nieważny Bearer. |
| **403** | **`ADMIN`**; brak uprawnień do OSK kursu; kursant nie przypisany do szkoły kursu; wyłączone konto. |
| **404** | Brak użytkownika / nie-kursant; brak kursu; brak uczestnictwa w kursie. |

## Błędy (szczegóły — typowe)

| Kod | Sytuacja |
|-----|----------|
| **400** | Brak / nieprawidłowe `schoolId`, nieprawidłowy `:userId`. |
| **401** | Brak lub nieważny Bearer. |
| **403** | Kursant próbuje czytać cudze dane; brak uprawnień do OSK (manager / instruktor). |
| **404** | Kursant nie istnieje w kontekście podanej OSK (patrz logika powyżej). |

## Błędy — GET `/students` lista (typowe)

| Kod | Sytuacja |
|-----|----------|
| **400** | Brak / nieprawidłowe `schoolId`, nieprawidłowy `courseId`, `limit` > 100, itp. |
| **401** | Brak lub nieważny Bearer. |
| **403** | Brak uprawnień do podanej OSK (manager / instruktor). |
| **404** | Podano `courseId`, ale kurs nie istnieje, jest soft-delete lub nie należy do tej `schoolId`. |

Powiązanie z kursami (lista kursów w OSK): [courses-api.md](./courses-api.md).
