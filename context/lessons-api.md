---
description: "API — odczyt (GET /lessons/:id), rezerwacja (POST /lessons), edycja/anulowanie (PATCH /lessons/:id), GET /vehicles z filtrem czasu"
alwaysApply: true
---

# Lekcje — API

**`Lesson`** (zasób `/lessons`) to **pojedyncza lekcja praktyczna** (jazda): w jednym rekordzie jest **jeden kursant** i **jeden instruktor** — układ **1:1** w danym przedziale czasu (z przypisanym pojazdem). To nie jest zajęcie grupowe; teoria / bloki grupowe są modelem **`InstructorEvent`** (`POST /events`, `type: THEORY` itd.).

Montowanie w `src/server.ts`:

- **`GET /lessons/:id`** — odczyt pojedynczej lekcji (`Lesson`); MANAGER lub ADMIN z dostępem do OSK kursu (jak przy POST/PATCH)
- **`POST /lessons`** — tworzenie lekcji (`Lesson`) dla kursanta na kursie; MANAGER lub ADMIN właściciela OSK
- **`PATCH /lessons/:id`** — **anulowanie** (`{ "status": "CANCELLED" }`) lub **edycja** (`startTime`/`endTime`/`instructorId`/`vehicleId`); oba warianty tylko dla lekcji ze **`SCHEDULED`**
- **`GET /vehicles`** — opcjonalne query **`startTime`** + **`endTime`** (ISO 8601) — lista pojazdów wolnych w danym oknie (bez kolizji z lekcjami i eventami DRIVE na `vehicleId`)

Implementacja:

| Obszar | Pliki |
|--------|--------|
| Rezerwacja, edycja i anulowanie lekcji | `src/routes/lessons.routes.ts`, `src/controllers/lesson.controller.ts`, `src/services/lesson.service.ts`, `src/schemas/lesson.schemas.ts` |
| Kolizje kursanta, limit godzin pakietu | `src/lib/lesson-scheduling.ts` (`assertStudentNoScheduleOverlap`, `assertCourseDrivingPackageHoursAllowNewLesson`, `sumCompletedDrivingLessonMinutes`) |
| Walidacja pojazdu (instruktor ↔ szkoła) | `src/lib/vehicle.helpers.ts` (`validateVehicleForInstructor` — używane też w `event.service.ts`) |
| Lista pojazdów z filtrem czasu | `src/services/vehicle.service.ts`, `src/schemas/vehicle.schemas.ts` (`vehicleListQuerySchema`) |

Model: `Lesson` — zob. [database.md](./database.md). Terminarz: [events-schedule-api.md](./events-schedule-api.md).

---

## POST `/lessons`

Tworzenie zaplanowanej lekcji.

### Uwierzytelnianie i autoryzacja

- **`authMiddleware`** + **`requireMinRole('MANAGER')`** (MANAGER lub ADMIN).
- **MANAGER** — tylko kursy własnej OSK (`ownerId` w `driving_schools`).
- **ADMIN** — dowolny kurs w systemie.

### Body (JSON)

| Pole | Typ | Walidacja |
|------|-----|-----------|
| `courseId` | string | UUID |
| `studentId` | string | UUID — `User.id` kursanta (nie `StudentProfile.id`) |
| `instructorId` | string | UUID — `InstructorProfile.id` |
| `startTime` | string | ISO 8601 datetime |
| `endTime` | string | ISO 8601; musi być **po** `startTime` |
| `lessonType` | string | stała **`PRACTICE`** — rezerwacja przez to API dotyczy wyłącznie jazdy; **teoria grupowa** wyłącznie przez **`POST /events`** (`type: THEORY`) |
| `vehicleId` | string | UUID — **wymagane** (jazda zawsze z pojazdem) |

**Reguły biznesowe:** start i koniec w **jednej dobie UTC** (`assertInstructorTimeWindowAvailable`); okno w `bookingMaxDaysAhead` ze `SchoolSettings` (względem dnia UTC lekcji); `startTime` w przyszłości; kursant musi być uczestnikiem kursu (`CourseParticipant`); instruktor przypisany do szkoły kursu (`InstructorSchool`); jeśli kurs ma `instructorId`, musi zgadzać się z `body.instructorId`; **kursant nie może mieć w tym samym czasie** innej nieanulowanej lekcji ani zapisu na blok instruktora (`event_participants`); **dla kursów `PRACTICAL` i `EXTRA`**: suma czasu trwania wszystkich nieanulowanych lekcji (`SCHEDULED` + `COMPLETED`) + nowa jazda nie może przekroczyć `courses.total_hours` (pakiet godzin); brak nakładania na inne lekcje / `InstructorEvent` instruktora; pojazd aktywny w szkole kursu, przypisany do instruktora, wolny w czasie (lekcja lub event DRIVE). **Rozliczenie „wykorzystanych” godzin** (np. raporty): suma czasu lekcji ze **`COMPLETED`** — funkcja `sumCompletedDrivingLessonMinutes`; **anulowane (`CANCELLED`)** nie zużywają limitu pakietu i zwalniają slot instruktora oraz pojazd.

### Odpowiedź (201)

```json
{
  "success": true,
  "data": {
    "lesson": {
      "id": "<uuid>",
      "courseId": "<uuid>",
      "studentId": "<uuid>",
      "instructorId": "<uuid>",
      "vehicleId": "<uuid> | null",
      "lessonType": "PRACTICE",
      "startTime": "2026-04-20T09:00:00.000Z",
      "endTime": "2026-04-20T10:00:00.000Z",
      "status": "SCHEDULED",
      "createdAt": "..."
    }
  }
}
```

### Kody błędów

| Kod | Sytuacja |
|-----|----------|
| **401** | Brak / niepoprawny JWT |
| **403** | Rola poniżej MANAGER; MANAGER bez powiązania z kursem szkoły; konto kursanta wyłączone |
| **400** | Niepoprawne body (m.in. `lessonType` ≠ `PRACTICE`, brak `vehicleId`); `startTime` ≥ `endTime`; czas w przeszłości; poza `bookingMaxDaysAhead`; instruktor nie w szkole kursu; niezgodność z instruktorem przypisanym do kursu |
| **404** | Kurs nie istnieje; użytkownik nie jest studentem; brak uczestnictwa w kursie |
| **409** | Slot poza dostępnością instruktora; kolizja z lekcją / eventem instruktora lub **kalendarzem kursanta**; przekroczenie **pakietu godzin** kursu (`PRACTICAL`/`EXTRA`); pojazd zajęty |

---

## GET `/lessons/:id`

Odczyt **jednej lekcji praktycznej 1:1** (kursant ↔ instruktor) po UUID (`lessons.id`). Odpowiedź zawsze **JSON** (w tym **404** — envelope błędu).

### Uwierzytelnianie i autoryzacja

Jak przy **POST `/lessons`** (`MANAGER` lub `ADMIN` z dostępem do OSK kursu lekcji).

### Parametry ścieżki

| Parametr | Opis |
|----------|------|
| `:id` | UUID lekcji (`lessons.id`) |

### Odpowiedź (200)

**`data.lesson`** — wspólne pola z **POST `/lessons`**: `id`, `courseId`, `lessonType`, `startTime`, `endTime`, `status`, `createdAt`. **Bez** osobnych `studentId`, `instructorId`, `vehicleId` — identyfikatory są w `lesson.student.id`, `lesson.instructor.id` oraz w `lesson.vehicle` (albo `vehicle: null`).

| Pole | Opis |
|------|------|
| `instructor` | Profil + konto użytkownika instruktora |
| `student` | Profil + konto kursanta |
| `vehicle` | Pełny rekord pojazdu (`Vehicle`) lub **`null`**, gdy lekcja nie ma przypisanego pojazdu |

**`lesson.instructor` / `lesson.student`:**

| Pole | Opis |
|------|------|
| `id` | `InstructorProfile.id` lub `StudentProfile.id` |
| `userId` | `User.id` — np. link do `/students/:userId` |
| `firstName`, `lastName` | Z rekordu użytkownika |
| `email` | E-mail konta |
| `phone` | Telefon lub `null` |

```json
{
  "success": true,
  "data": {
    "lesson": {
      "id": "<uuid>",
      "courseId": "<uuid>",
      "lessonType": "PRACTICE",
      "startTime": "2026-04-20T09:00:00.000Z",
      "endTime": "2026-04-20T10:00:00.000Z",
      "status": "SCHEDULED",
      "createdAt": "...",
      "instructor": {
        "id": "<instructorProfileUuid>",
        "userId": "<userUuid>",
        "firstName": "Jan",
        "lastName": "Kowalski",
        "email": "jan@example.com",
        "phone": "+48123456789"
      },
      "student": {
        "id": "<studentProfileUuid>",
        "userId": "<userUuid>",
        "firstName": "Anna",
        "lastName": "Nowak",
        "email": "anna@example.com",
        "phone": null
      },
      "vehicle": {
        "id": "<uuid>",
        "schoolId": "<uuid>",
        "name": "Toyota 01",
        "registrationNumber": "WW12345",
        "inspectionDate": "2026-06-01T00:00:00.000Z",
        "insuranceDate": "2026-12-01T00:00:00.000Z",
        "brand": "Toyota",
        "model": "Yaris",
        "photoUrl": "https://...",
        "modelYear": 2020,
        "mileageKm": 45000,
        "note": null,
        "isActive": true,
        "createdAt": "..."
      }
    }
  }
}
```

### Kody błędów

| Kod | Sytuacja |
|-----|----------|
| **401** | Brak / niepoprawny JWT |
| **403** | Rola poniżej MANAGER; MANAGER bez powiązania z OSK kursu |
| **400** | Niepoprawny UUID w `:id` |
| **404** | Lekcja nie istnieje lub `deletedAt` ustawione |

---

## PATCH `/lessons/:id`

Dwa warianty body (rozłączne — nie łączyć pól z obu w jednym żądaniu):

1. **Anulowanie** — ustawienie **`status: CANCELLED`**.
2. **Edycja** — zmiana **`startTime`**, **`endTime`**, **`instructorId`** i/lub **`vehicleId`** (co najmniej jedno pole; `startTime` i `endTime` zawsze razem).

### Uwierzytelnianie i autoryzacja

Jak przy **POST `/lessons`** (`MANAGER` lub `ADMIN` z dostępem do OSK kursu).

### Parametry ścieżki

| Parametr | Opis |
|----------|------|
| `:id` | UUID lekcji (`lessons.id`) |

### Body (JSON) — anulowanie

| Pole | Typ | Walidacja |
|------|-----|-----------|
| `status` | string | wyłącznie **`CANCELLED`** |

**Reguły:** dozwolone tylko gdy bieżący status to **`SCHEDULED`**. **`COMPLETED`** → **400**; już **`CANCELLED`** → **400**. Po anulowaniu rekord pozostaje w bazie z `status: CANCELLED` (historia).

### Body (JSON) — edycja

| Pole | Typ | Walidacja |
|------|-----|-----------|
| `startTime` | string | opcjonalne; ISO 8601 datetime; jeśli podane, wymagane jest też **`endTime`** |
| `endTime` | string | opcjonalne; ISO 8601 datetime; jeśli podane, wymagane jest też **`startTime`** |
| `instructorId` | string | opcjonalne; UUID (`InstructorProfile.id`) |
| `vehicleId` | string | opcjonalne; UUID pojazdu |

**Reguły:** tylko gdy status to **`SCHEDULED`**. Nie można zmieniać kursu ani kursanta — tylko czas, instruktor i pojazd. Reguły biznesowe jak przy **POST `/lessons`** (okno rezerwacji przy zmianie **daty/czasu**; przyszły czas; grafik instruktora z wykluczeniem tej lekcji; brak kolizji kursanta/instruktora/pojazdu; limit godzin pakietu przy zmianie czasu lub instruktora). Idempotentne body bez realnej zmiany zwraca **200** z aktualnym rekordem.

### Odpowiedź (200)

Ten sam kształt co **`data.lesson`** w POST (201). Po anulowaniu **`status`: `"CANCELLED"`**.

### Kody błędów

| Kod | Sytuacja |
|-----|----------|
| **400** | Niepoprawne body (np. mieszanie anulowania z edycją, brak wymaganego pola, pusta edycja); próba anulowania lub edycji nie **`SCHEDULED`** |
| **404** | Lekcja nie istnieje lub `deletedAt` ustawione |
| **403** | Brak uprawnień do OSK kursu |
| **409** | Kolizja terminu / pojazdu / limitu pakietu (jak przy POST) |

---

## GET `/vehicles` — filtr czasu (opcjonalny)

Oprócz wymaganego `schoolId` można podać **`startTime`** i **`endTime`** (oba naraz lub żadne). Wtedy z listy są **wykluczane** pojazdy, które w tym oknie mają kolidującą lekcję (status ≠ `CANCELLED`) lub event `InstructorEvent` z `type = DRIVE`.

Użycie: wybór pojazdu w modalu rezerwacji przy konkretnym slocie.

---

## Przepływ danych (frontend — modal rezerwacji)

1. Klik w slot z `GET /driving-schools/:id/availability/slots` — znany jest `instructorId`, `date`, `startTime`, `endTime`, `schoolId`.
2. Równolegle: `GET /students?schoolId=...` oraz `GET /vehicles?schoolId=...&startTime=...&endTime=...` (ISO złożone z daty + godzin slotu).
3. Po wyborze kursanta: `GET /students/:userId?schoolId=...` — lista kursów w `courses[]`.
4. `POST /lessons` z wybranym `courseId`, `studentId`, `instructorId`, czasem, `lessonType: "PRACTICE"`, `vehicleId`.

---

## Powiązane

- Wolne sloty: [driving-schools-api.md](./driving-schools-api.md) (`GET .../availability/slots`)
- Harmonogram: [events-schedule-api.md](./events-schedule-api.md).
