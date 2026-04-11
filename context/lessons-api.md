---
description: "API — rezerwacja lekcji (POST /lessons) i rozszerzenie GET /vehicles o filtr czasu"
alwaysApply: true
---

# Lekcje — API

Montowanie w `src/server.ts`:

- **`POST /lessons`** — tworzenie lekcji (`Lesson`) dla kursanta na kursie; MANAGER lub ADMIN właściciela OSK
- **`GET /vehicles`** — opcjonalne query **`startTime`** + **`endTime`** (ISO 8601) — lista pojazdów wolnych w danym oknie (bez kolizji z lekcjami i eventami DRIVE na `vehicleId`)

Implementacja:

| Obszar | Pliki |
|--------|--------|
| Rezerwacja lekcji | `src/routes/lessons.routes.ts`, `src/controllers/lesson.controller.ts`, `src/services/lesson.service.ts`, `src/schemas/lesson.schemas.ts` |
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

**Reguły biznesowe:** start i koniec w **jednej dobie UTC** (`assertInstructorTimeWindowAvailable`); okno w `bookingMaxDaysAhead` ze `SchoolSettings` (względem dnia UTC lekcji); `startTime` w przyszłości; kursant musi być uczestnikiem kursu (`CourseParticipant`); instruktor przypisany do szkoły kursu (`InstructorSchool`); jeśli kurs ma `instructorId`, musi zgadzać się z `body.instructorId`; brak nakładania na inne lekcje / `InstructorEvent` instruktora; pojazd aktywny w szkole kursu, przypisany do instruktora, wolny w czasie (lekcja lub event DRIVE).

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
| **409** | Slot poza dostępnością instruktora; kolizja z lekcją / eventem instruktora; pojazd zajęty |

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
