---
description: "API — eventy instruktora (POST/PATCH /events) i terminarz lekcji (GET /schedule/me, GET /schedule)"
alwaysApply: true
---

# Events i Schedule — API

Montowanie w `src/server.ts`:

- **`/events`** — bloki czasu instruktora (`InstructorEvent`); **`PATCH /events/:id`** — częściowa edycja; opcjonalnie limit miejsc (`capacity`) i przypisanie kursantów przez **`POST /events/:id/students`** (tabela `event_participants`)
- **`/lessons`** — tworzenie lekcji (`Lesson`) — zob. [lessons-api.md](./lessons-api.md)
- **`/schedule`** — **lekcje** (`Lesson`) oraz **eventy instruktora** (`InstructorEvent`) w zadanym zakresie dat, scalone i posortowane po `startTime` (terminarz osobisty lub podgląd przez MANAGER/ADMIN)

Implementacja:

| Obszar | Pliki |
|--------|--------|
| Eventy | `src/routes/events.routes.ts`, `src/controllers/event.controller.ts`, `src/services/event.service.ts`, `src/schemas/event.schemas.ts` |
| Lekcje (tworzenie) | `src/routes/lessons.routes.ts`, `src/controllers/lesson.controller.ts`, `src/services/lesson.service.ts`, `src/schemas/lesson.schemas.ts` — szczegóły [lessons-api.md](./lessons-api.md) |
| Terminarz | `src/routes/schedule.routes.ts`, `src/controllers/schedule.controller.ts`, `src/services/schedule.service.ts`, `src/schemas/schedule.schemas.ts` |
| Dostępność (sloty, walidacja okna czasu) | `src/services/instructor-availability.service.ts` (`assertInstructorTimeWindowAvailable`, `computeDayWindows` z uwzględnieniem `instructor_events`; przy **edycji** eventu bieżący event jest **wykluczany** z listy zajętych slotów — `excludeEventId`; przy tworzeniu / aktualizacji odczyty availability idą **tym samym** `tx` co konflikty i zapis w `event.service.ts`) |

Model danych: `InstructorEvent`, `EventParticipant` (M:N kursant ↔ event), enum `EventType` — zob. [database.md](./database.md).

---

## Model domenowy (skrót)

- **InstructorEvent** — blok czasu przypisany do `InstructorProfile`; typ `DRIVE` (wymaga `vehicleId`) lub `THEORY`; opcjonalne **`capacity`** (max liczba kursantów zapisanych przez `event_participants`; `null` = brak limitu w MVP); nie nachodzi na lekcje ani inne eventy tego instruktora; mieści się w dostępności (weekly + exceptions, urlopy itd. — jak w module availability).
- **EventParticipant** — przypisanie **`StudentProfile.id`** do **`InstructorEvent.id`**; unikalność pary (event, student); przy dodawaniu listy kursantów sprawdzane są **capacity** (jeśli ustawione) oraz **konflikt czasowy** z innymi eventami, na które kursant jest już zapisany (nachodzące `startTime`/`endTime`).
- **Schedule** w API zwraca **Lesson** oraz **InstructorEvent** (pole `kind` rozróżnia wpisy); eventy wpływają także na **obliczane wolne sloty** przez `instructor-availability.service`.

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

## PATCH `/events/:id`

Częściowa aktualizacja istniejącego eventu (`InstructorEvent`). Brak pola w body = brak zmiany tego pola; **`vehicleId: null`** — jawne usunięcie pojazdu (np. przy przejściu na `THEORY`).

### Uwierzytelnianie i autoryzacja

- **`authMiddleware`** + **`requireMinRole('MANAGER')`** (MANAGER lub ADMIN).
- **MANAGER** — musi móc zarządzać dostępnością **obecnego** instruktora eventu; jeśli w body podano **`instructorId`** inny niż dotychczasowy — dodatkowo musi móc zarządzać dostępnością **nowego** instruktora (ta sama reguła co przy `POST /events`).
- **ADMIN** — dowolny event; przy zmianie instruktora — nowy musi być aktywnym profilem (`resolveActiveInstructorProfile`).

### Parametry ścieżki

| Parametr | Opis |
|----------|------|
| `:id` | UUID `InstructorEvent.id` |

### Body (JSON) — wszystkie pola opcjonalne

| Pole | Typ | Walidacja |
|------|-----|-----------|
| `instructorId` | string | UUID — `InstructorProfile.id` |
| `type` | string | **`DRIVE`** \| **`THEORY`** |
| `startTime` | string | ISO 8601 datetime |
| `endTime` | string | ISO 8601; jeśli podane **oba** z `startTime` w body — musi być **po** `startTime` (Zod) |
| `vehicleId` | string \| null | UUID lub **`null`** (wyczyszczenie); po merge: dla **`DRIVE`** pojazd jest **wymagany** |
| `capacity` | number \| null | liczba całkowita **≥ 0** lub **`null`** (bez limitu) |

**Reguły biznesowe (po scaleniu z rekordem w bazie):** `startTime` musi być przed `endTime`; dla **`DRIVE`** — `vehicleId` ustawiony i walidacja pojazdu jak przy `POST /events`. Przy zmianie **czasu** lub **instruktora**: ten sam zestaw reguł co przy tworzeniu — jedna doba UTC, miejsce w grafiku (`assertInstructorTimeWindowAvailable`), brak nakładania na lekcje i inne eventy; **edytowany event jest wykluczany** z sprawdzania kolizji i z obliczania „zajętych” fragmentów dnia (brak false positive). Przy zmianie tylko **`type`** / **`capacity`** / **`vehicleId`** (bez zmiany czasu i instruktora) — pomijane są walidacje czasowe względem grafiku i kolizji instruktora; dla **`DRIVE`** nadal sprawdzane jest **zajęcie pojazdu** (z wykluczeniem tego eventu). MVP: race condition przy równoległych edycjach — akceptowalne.

### Odpowiedź (200)

Ten sam kształt co `data.event` w **POST `/events`** (201), ale kod **200**.

### Kody błędów

| Kod | Sytuacja |
|-----|----------|
| **401** | Brak / niepoprawny JWT |
| **403** | Rola poniżej MANAGER; MANAGER bez uprawnień do instruktora (obecnego lub nowego) |
| **400** | Niepoprawne body; po merge: brak `vehicleId` dla DRIVE; `startTime` ≥ `endTime`; start i koniec nie w jednej dobie UTC; pojazd nie w szkole instruktora |
| **404** | Event nie istnieje; przy zmianie instruktora — nowy instruktor nie znaleziony / nieaktywny; pojazd nie znaleziony (DRIVE) |
| **409** | Okno poza dostępnością; kolizja z lekcją lub innym eventem; pojazd zajęty (DRIVE) |

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

Lista pozycji terminarza zalogowanego użytkownika w zakresie dat: **lekcje** oraz **eventy instruktora**, w których uczestniczy (jako kursant) lub które prowadzi (jako instruktor).

### Uwierzytelnianie i autoryzacja

- **`authMiddleware`** (każdy zalogowany).
- **Dozwolone:** **STUDENT**, **INSTRUCTOR** — własne lekcje oraz powiązane eventy (zapis / prowadzenie).
- **MANAGER**, **ADMIN** — **403 Forbidden** (nie „własny” terminarz w tym endpoincie).

### Query

| Parametr | Wymagane | Opis |
|----------|----------|------|
| `dateFrom` | tak | `YYYY-MM-DD` (UTC — interpretacja zakresu jak w serwisie) |
| `dateTo` | tak | `YYYY-MM-DD`; `dateFrom` ≤ `dateTo` |

### Odpowiedź (200)

`data.items` — tablica **lekcji i eventów**, posortowana rosnąco po `startTime`. Każdy element ma pole **`kind`**:

| `kind` | Znaczenie |
|--------|-----------|
| **`lesson`** | Lekcja (`Lesson`): `type` = `Lesson.lessonType` (**`THEORY`** \| **`PRACTICE`** — w bazie mogą zostać stare wpisy `THEORY`; **nowe** rezerwacje lekcji to wyłącznie **`PRACTICE`** przez `POST /lessons`), `status`, opcjonalnie `vehicle` |
| **`instructor_event`** | Event (`InstructorEvent`): **`eventType`** (`DRIVE` \| `THEORY`); dodatkowo **`type`** jak u lekcji (**`THEORY`** \| **`PRACTICE`** — DRIVE→PRACTICE), **`status`:** `SCHEDULED`, `capacity`, `participantCount`, opcjonalnie `vehicle` |

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "kind": "lesson",
        "id": "<uuid>",
        "type": "PRACTICE",
        "status": "SCHEDULED",
        "startTime": "2026-04-01T09:00:00.000Z",
        "endTime": "2026-04-01T10:00:00.000Z",
        "instructor": { "id": "<uuid>", "firstName": "...", "lastName": "..." },
        "student": { "id": "<uuid>", "firstName": "...", "lastName": "..." },
        "vehicle": { "id": "<uuid>", "name": "...", "registrationNumber": "..." }
      },
      {
        "kind": "instructor_event",
        "id": "<uuid>",
        "eventType": "THEORY",
        "type": "THEORY",
        "status": "SCHEDULED",
        "startTime": "2026-04-01T10:00:00.000Z",
        "endTime": "2026-04-01T11:30:00.000Z",
        "capacity": 20,
        "participantCount": 12,
        "students": [
          { "id": "<uuid>", "firstName": "...", "lastName": "..." }
        ]
      }
    ]
  }
}
```

- **Lekcja (`kind: lesson`):** jako **STUDENT** — widoczny **`instructor`** (i opcjonalnie `vehicle`); jako **INSTRUCTOR** — widoczny **`student`** (i opcjonalnie `vehicle`).
- **Event (`kind: instructor_event`):** jako **STUDENT** — widoczny **`instructor`** (i opcjonalnie `vehicle` dla `DRIVE`); **`students` nie jest zwracane**. Jako **INSTRUCTOR** — widoczna tablica **`students`**, bez `instructor`.
- Lekcje ze statusem **`CANCELLED`** są **wykluczone**.

### Kody błędów

| Kod | Sytuacja |
|-----|----------|
| **401** | Brak / niepoprawny JWT |
| **403** | MANAGER / ADMIN na `/schedule/me` |
| **400** | Niepoprawny query (np. zły format dat, `dateFrom` > `dateTo`) |
| **404** | Brak profilu `InstructorProfile` / `StudentProfile` dla użytkownika (gdy rola wymaga profilu) |

---

## GET `/schedule`

Terminarz **wybranego** instruktora lub studenta (podgląd dla biura): lekcje oraz eventy instruktora / eventy, na które zapisany jest kursant.

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

Ten sam kształt co `GET /schedule/me`: `data.items` z **`kind`**: **`lesson`** \| **`instructor_event`** (jak wyżej).

- Przy **`instructorId`:** lekcje i eventy tego instruktora; dla **`kind: lesson`** widoczny **`student`**; dla **`kind: instructor_event`** widoczna tablica **`students`** (bez `instructor`).
- Przy **`studentId`:** lekcje kursanta oraz eventy, na które jest zapisany; dla **`kind: lesson`** widoczny **`instructor`**; dla **`kind: instructor_event`** widoczny **`instructor`**, bez listy **`students`**.

Filtrowanie: lekcje **nakładające się** na zakres `[dateFrom, dateTo]` (UTC), bez `CANCELLED`; eventy — ten sam zakres czasu (nachodzące na przedział).

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
4. **GET /schedule/me:** STUDENT z `dateFrom`/`dateTo` → **200**, `items` — jego lekcje oraz eventy, na które jest zapisany (`kind` odpowiednio `lesson` / `instructor_event`).
5. **GET /schedule/me:** ADMIN → **403**.
6. **GET /schedule:** MANAGER + `instructorId` + zakres → **200**; `studentId` + zakres → **200**; `studentId` i `instructorId` razem → **400**.
7. **POST /events/:id/students:** MANAGER, `studentIds` = `users.id`, capacity nieprzekroczone → **200** (`assigned` / `skipped`); duplikat w tablicy → **400**; drugi event w tym samym czasie dla kursanta → **409**.
8. **PATCH /events/:id:** MANAGER — zmiana tylko `capacity` → **200**; zmiana czasu na ten sam slot co dotychczas → **200** (bez kolizji z samym sobą); przesunięcie na zajęty slot innego eventu → **409**.
