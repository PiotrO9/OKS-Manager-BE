---
description: "API — eventy instruktora (POST /events) i terminarz lekcji (GET /schedule/me, GET /schedule)"
alwaysApply: true
---

# Events i Schedule — API

Montowanie w `src/server.ts`:

- **`/events`** — bloki czasu instruktora (`InstructorEvent`); opcjonalnie limit miejsc (`capacity`) i przypisanie kursantów przez **`POST /events/:id/students`** (tabela `event_participants`)
- **`/lessons`** — tworzenie lekcji (`Lesson`) — zob. [lessons-api.md](./lessons-api.md)
- **`/schedule`** — lista **lekcji** (`Lesson`) w zadanym zakresie dat (terminarz osobisty lub podgląd przez MANAGER/ADMIN)

Implementacja:

| Obszar | Pliki |
|--------|--------|
| Eventy | `src/routes/events.routes.ts`, `src/controllers/event.controller.ts`, `src/services/event.service.ts`, `src/schemas/event.schemas.ts` |
| Lekcje (tworzenie) | `src/routes/lessons.routes.ts`, `src/controllers/lesson.controller.ts`, `src/services/lesson.service.ts`, `src/schemas/lesson.schemas.ts` — szczegóły [lessons-api.md](./lessons-api.md) |
| Terminarz | `src/routes/schedule.routes.ts`, `src/controllers/schedule.controller.ts`, `src/services/schedule.service.ts`, `src/schemas/schedule.schemas.ts` |
| Dostępność (sloty, walidacja okna czasu) | `src/services/instructor-availability.service.ts` (`assertInstructorTimeWindowAvailable`, `computeDayWindows` z uwzględnieniem `instructor_events`; przy tworzeniu eventu odczyty availability idą **tym samym** `tx` co konflikty i `create` w `event.service.ts`) |

Model danych: `InstructorEvent`, `EventParticipant` (M:N kursant ↔ event), enum `EventType` — zob. [database.md](./database.md).

---

## Model domenowy (skrót)

- **InstructorEvent** — blok czasu przypisany do `InstructorProfile`; typ `DRIVE` (wymaga `vehicleId`) lub `THEORY`; opcjonalne **`capacity`** (max liczba kursantów zapisanych przez `event_participants`; `null` = brak limitu w MVP); nie nachodzi na lekcje ani inne eventy tego instruktora; mieści się w dostępności (weekly + exceptions, urlopy itd. — jak w module availability).
- **EventParticipant** — przypisanie **`StudentProfile.id`** do **`InstructorEvent.id`**; unikalność pary (event, student); przy dodawaniu listy kursantów sprawdzane są **capacity** (jeśli ustawione) oraz **konflikt czasowy** z innymi eventami, na które kursant jest już zapisany (nachodzące `startTime`/`endTime`).
- **Schedule** w API zwraca wyłącznie **Lesson** (nie zwraca `InstructorEvent`); eventy wpływają na **obliczane wolne sloty** przez `instructor-availability.service`.

---

## POST `/events`

Tworzenie eventu instruktora.

### Uwierzytelnianie i autoryzacja

- **`authMiddleware`** + **`requireMinRole('MANAGER')`** (MANAGER lub ADMIN).
- **MANAGER** może tworzyć eventy tylko dla instruktorów przypisanych do jego OSK (`assertActorCanManageAvailability` — jak przy availability).
- **ADMIN** — dowolny aktywny instruktor (`resolveActiveInstructorProfile`).

### Body (JSON)

| Pole | Typ | Walidacja |
|------|-----|-----------|
| `instructorId` | string | UUID — `InstructorProfile.id` |
| `type` | string | enum Prisma: **`DRIVE`** \| **`THEORY`** |
| `startTime` | string | ISO 8601 datetime (Zod `.datetime()` — z offsetem lub `Z`) |
| `endTime` | string | ISO 8601; musi być **po** `startTime` |
| `vehicleId` | string | opcjonalne UUID; **wymagane** gdy `type === DRIVE` |
| `capacity` | number | opcjonalne; liczba całkowita **≥ 0** — max liczba kursantów (`event_participants`); brak pola / pominięcie = **`null`** (bez limitu) |

**Reguły biznesowe:** start i koniec muszą leżeć w **jednej dobie kalendarzowej UTC**; miejsce w grafiku musi być w wolnym oknie po odjęciu lekcji, time blocków i innych eventów (`assertInstructorTimeWindowAvailable`). Dla **DRIVE** pojazd musi istnieć, być aktywny i należeć do szkoły, do której instruktor jest przypisany (`instructor_schools`).

### Odpowiedź (201)

```json
{
  "success": true,
  "data": {
    "event": {
      "id": "<uuid>",
      "instructorId": "<uuid>",
      "type": "DRIVE",
      "startTime": "2026-04-01T08:00:00.000Z",
      "endTime": "2026-04-01T09:00:00.000Z",
      "vehicleId": "<uuid> | null",
      "capacity": 20,
      "createdAt": "..."
    }
  }
}
```

### Kody błędów

| Kod | Sytuacja |
|-----|----------|
| **401** | Brak / niepoprawny JWT |
| **403** | Rola poniżej MANAGER; MANAGER bez powiązania instruktora z własną OSK |
| **400** | Niepoprawne body (UUID, daty, brak `vehicleId` dla DRIVE, `startTime` ≥ `endTime`, start i koniec **nie** w jednej dobie UTC, inne walidacje wejścia / serwisu poza konfliktem grafiku) |
| **404** | Instruktor nie znaleziony lub nieaktywny; pojazd nie znaleziony (DRIVE) |
| **409** | Okno **nie mieści się** w wolnym fragmencie grafiku (weekly, wyjątki, urlop, zajęte sloty — komunikat m.in. `Slot outside instructor availability`); nakładanie z lekcją lub innym eventem; dla DRIVE — pojazd zajęty (lekcja lub inny event DRIVE na tym pojeździe) |

**Breaking (klienci):** wcześniej część przypadków „poza dostępnością” mogła być zwracana jako **400**; obecnie konflikt ze **stanem grafiku** dla tej reguły to **409** (jak pozostałe konflikty czasu).

---

## POST `/events/:id/students`

Przypisanie **jednego lub wielu** kursantów do istniejącego eventu (`InstructorEvent`). Idempotentnie: kursant już zapisany na ten event jest **pomijany** (licznik `skipped`), bez błędu.

### Uwierzytelnianie i autoryzacja

- **`authMiddleware`** + **`requireMinRole('MANAGER')`** (MANAGER lub ADMIN).
- **MANAGER** — tylko gdy może zarządzać dostępnością tego instruktora (`assertActorCanManageAvailability` — ta sama reguła co przy `POST /events`).
- **ADMIN** — dowolny event (instruktor aktywny w systemie).

### Parametry ścieżki

| Parametr | Opis |
|----------|------|
| `:id` | UUID `InstructorEvent.id` |

### Body (JSON)

| Pole | Typ | Walidacja |
|------|-----|-----------|
| `studentIds` | string[] | niepusta tablica (max **50** pozycji); każdy element to UUID **`users.id`** kursanta (jak przy `POST /lessons`); **bez duplikatów** w jednym żądaniu |

### Reguły biznesowe (MVP)

- Brak duplikatów w `studentIds` → **400**.
- Event nie istnieje → **404**.
- Którykolwiek `studentIds` nie jest aktywnym użytkownikiem z rolą **STUDENT** i profilem kursanta → **404** (`One or more students not found`).
- Po odfiltrowaniu już zapisanych: suma **obecnych uczestników + nowych** nie może przekroczyć **`capacity`**, jeśli `capacity` jest ustawione → **409**.
- Dla każdego nowego kursanta: brak nakładającego się w czasie innego eventu, na który jest zapisany (`start < existingEnd && end > existingStart`) → w przeciwnym razie **409** (`Student has a conflicting scheduled event`). Zakres MVP: **tylko kolizje między eventami** (nie krzyżuje z tabelą `lessons`).
- Cała operacja jest **atomowa** (transakcja): część poprawna / część błędna → **odrzucenie całości**.

### Odpowiedź (200)

```json
{
  "success": true,
  "data": {
    "assigned": 2,
    "skipped": 1
  }
}
```

- **`assigned`** — liczba **nowo** utworzonych przypisań.
- **`skipped`** — liczba kursantów z żądania już wcześniej przypisanych do tego eventu.

### Kody błędów

| Kod | Sytuacja |
|-----|----------|
| **401** | Brak / niepoprawny JWT |
| **403** | Rola poniżej MANAGER; MANAGER bez uprawnień do instruktora eventu |
| **400** | Niepoprawne body (UUID, pusta tablica, duplikaty w `studentIds`) |
| **404** | Event lub kursant nie znaleziony |
| **409** | Przekroczenie `capacity` lub konflikt czasowy kursanta z innym eventem |

---

## GET `/schedule/me`

Lista lekcji zalogowanego użytkownika w zakresie dat.

### Uwierzytelnianie i autoryzacja

- **`authMiddleware`** (każdy zalogowany).
- **Dozwolone:** **STUDENT**, **INSTRUCTOR** — własne lekcje.
- **MANAGER**, **ADMIN** — **403 Forbidden** (nie „własny” terminarz w tym endpoincie).

### Query

| Parametr | Wymagane | Opis |
|----------|----------|------|
| `dateFrom` | tak | `YYYY-MM-DD` (UTC — interpretacja zakresu jak w serwisie) |
| `dateTo` | tak | `YYYY-MM-DD`; `dateFrom` ≤ `dateTo` |

### Odpowiedź (200)

`data.items` — tablica lekcji, posortowana rosnąco po `startTime`.

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "<uuid>",
        "type": "THEORY",
        "status": "SCHEDULED",
        "startTime": "2026-04-01T10:00:00.000Z",
        "endTime": "2026-04-01T11:00:00.000Z",
        "instructor": { "id": "<uuid>", "firstName": "...", "lastName": "..." },
        "student": { "id": "<uuid>", "firstName": "...", "lastName": "..." },
        "vehicle": { "id": "<uuid>", "name": "...", "registrationNumber": "..." }
      }
    ]
  }
}
```

- Jako **STUDENT:** widoczny jest **`instructor`** (oraz opcjonalnie `vehicle`).
- Jako **INSTRUCTOR:** widoczny jest **`student`** (oraz opcjonalnie `vehicle`).
- `type` — wartość z `Lesson.lessonType` (**`THEORY`** \| **`PRACTICE`**).
- Lekcje ze statusem **`CANCELLED`** są **wyklucane**.

### Kody błędów

| Kod | Sytuacja |
|-----|----------|
| **401** | Brak / niepoprawny JWT |
| **403** | MANAGER / ADMIN na `/schedule/me` |
| **400** | Niepoprawny query (np. zły format dat, `dateFrom` > `dateTo`) |
| **404** | Brak profilu `InstructorProfile` / `StudentProfile` dla użytkownika (gdy rola wymaga profilu) |

---

## GET `/schedule`

Terminarz lekcji **wybranego** instruktora lub studenta (podgląd dla biura).

### Uwierzytelnianie i autoryzacja

- **`authMiddleware`** + **`requireMinRole('MANAGER')`** (MANAGER lub ADMIN).

### Query

| Parametr | Wymagane | Opis |
|----------|----------|------|
| `dateFrom` | tak | `YYYY-MM-DD` |
| `dateTo` | tak | `YYYY-MM-DD` |
| `instructorId` | jeden z dwóch | UUID `InstructorProfile.id` — lekcje tego instruktora |
| `studentId` | jeden z dwóch | UUID `StudentProfile.id` — lekcje tego kursanta |

**Dokładnie jeden** z `instructorId` lub `studentId` musi być podany (nie zero, nie oba).

### Odpowiedź (200)

Ten sam kształt co `GET /schedule/me`: `data.items`.

- Przy **`instructorId`:** w każdym elemencie widoczny **`student`** (oraz opcjonalnie `vehicle`).
- Przy **`studentId`:** widoczny **`instructor`** (oraz opcjonalnie `vehicle`).

Filtrowanie: lekcje **nakładające się** na zakres `[dateFrom, dateTo]` (UTC), bez `CANCELLED`.

### Kody błędów

| Kod | Sytuacja |
|-----|----------|
| **401** | Brak / niepoprawny JWT |
| **403** | Rola poniżej MANAGER |
| **400** | Niepoprawny query (daty, UUID, brak lub podwójny wybór `instructorId`/`studentId`) |

---

## Checklist smoke (ręczna)

1. **POST /events:** MANAGER z OSK — DRIVE z `vehicleId` z tej szkoły → **201**; bez `vehicleId` przy DRIVE → **400**.
2. **POST /events:** slot poza grafikiem / brak wolnego okna → **409** (`Slot outside instructor availability`).
3. **POST /events:** nakładanie na istniejącą lekcję → **409**.
4. **GET /schedule/me:** STUDENT z `dateFrom`/`dateTo` → **200**, `items` tylko jego lekcje.
5. **GET /schedule/me:** ADMIN → **403**.
6. **GET /schedule:** MANAGER + `instructorId` + zakres → **200**; `studentId` + zakres → **200**; `studentId` i `instructorId` razem → **400**.
7. **POST /events/:id/students:** MANAGER, `studentIds` = `users.id`, capacity nieprzekroczone → **200** (`assigned` / `skipped`); duplikat w tablicy → **400**; drugi event w tym samym czasie dla kursanta → **409**.
