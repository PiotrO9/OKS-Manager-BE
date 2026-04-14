---
description: "API — eventy instruktora (GET/POST/PUT/DELETE/PATCH /events, uczestnicy THEORY) i terminarz (GET /schedule/me, GET /schedule)"
alwaysApply: true
---

# Events i Schedule — API

Montowanie w `src/server.ts`:

- **`/events`** — bloki czasu instruktora (`InstructorEvent`); **`GET /events/:id`** — odczyt pojedynczego eventu (prefill edycji) z **`instructor`** i **`students`** (pełne obiekty kursantów z `event_participants`); **`DELETE /events/:id`** — soft delete (`isActive = false`; rekord pozostaje, nie widać go w harmonogramie ani w slotach); **`GET /events/:id/students`** — lista **`users.id`** kursantów przypisanych do eventu; **`PUT /events/:id/students`** — pełna zamiana listy uczestników; **`DELETE /events/:id/students/:studentUserId`** — usunięcie jednego uczestnika (`studentUserId` = `users.id`); **`PATCH /events/:id`** — częściowa edycja; opcjonalnie limit miejsc (`capacity`) i dopisywanie kursantów przez **`POST /events/:id/students`** (tabela `event_participants`; semantyka „dokładka”, nie pełna zamiana — do synchronizacji zbioru użyj **PUT**)
- **`/lessons`** — tworzenie lekcji (`Lesson`) — zob. [lessons-api.md](./lessons-api.md)
- **`/schedule`** — **lekcje** (`Lesson`) oraz **eventy instruktora** (`InstructorEvent`) w zadanym zakresie dat, scalone i posortowane po `startTime` (terminarz osobisty lub podgląd przez MANAGER/ADMIN)

Implementacja:

| Obszar | Pliki |
|--------|--------|
| Eventy | `src/routes/events.routes.ts`, `src/controllers/event.controller.ts`, `src/services/event.service.ts`, `src/schemas/event.schemas.ts` |
| Lekcje (tworzenie) | `src/routes/lessons.routes.ts`, `src/controllers/lesson.controller.ts`, `src/services/lesson.service.ts`, `src/schemas/lesson.schemas.ts` — szczegóły [lessons-api.md](./lessons-api.md) |
| Terminarz | `src/routes/schedule.routes.ts`, `src/controllers/schedule.controller.ts`, `src/services/schedule.service.ts`, `src/schemas/schedule.schemas.ts` |
| Dostępność (sloty, walidacja okna czasu) | `src/services/instructor-availability.service.ts` (`assertInstructorTimeWindowAvailable`, `computeDayWindows` z uwzględnieniem **wyłącznie aktywnych** `instructor_events` — `isActive: true`; przy **edycji** eventu bieżący event jest **wykluczany** z listy zajętych slotów — `excludeEventId`; przy tworzeniu / aktualizacji odczyty availability idą **tym samym** `tx` co konflikty i zapis w `event.service.ts`) |

Model danych: `InstructorEvent`, `EventParticipant` (M:N kursant ↔ event), enum `EventType` — zob. [database.md](./database.md).

---

## Model domenowy (skrót)

- **InstructorEvent** — blok czasu przypisany do `InstructorProfile`; typ `DRIVE` (wymaga `vehicleId`) lub `THEORY`; opcjonalne **`capacity`** (max liczba kursantów zapisanych przez `event_participants`; `null` = brak limitu w MVP); pole **`isActive`** (domyślnie `true`) — przy `false` wydarzenie jest „usunięte” (nie pokazywane w API harmonogramu / slotów, nie bierze udziału w kolizjach); nie nachodzi na lekcje ani inne **aktywne** eventy tego instruktora; mieści się w dostępności (weekly + exceptions, urlopy itd. — jak w module availability).
- **EventParticipant** — przypisanie **`StudentProfile.id`** do **`InstructorEvent.id`**; unikalność pary (event, student); przy dodawaniu listy kursantów sprawdzane są **capacity** (jeśli ustawione) oraz **konflikt czasowy** z innymi **aktywnymi** eventami, na które kursant jest już zapisany (nachodzące `startTime`/`endTime`).
- **Schedule** w API zwraca **Lesson** oraz **InstructorEvent** (pole `kind` rozróżnia wpisy); w zapytaniach do bazy brane są **tylko** eventy z **`isActive: true`**. Eventy wpływają także na **obliczane wolne sloty** przez `instructor-availability.service` (również tylko aktywne).

### Soft delete — zachowanie (`isActive`)

| Aspekt | Zachowanie |
|--------|------------|
| **Rekord w bazie** | Nie jest usuwany; ustawiane jest **`is_active = false`** (UPDATE). Relacje (`event_participants` itd.) **pozostają** — MVP bez czyszczenia uczestników przy usuwaniu. |
| **GET / PATCH / operacje na uczestnikach** | Dla nieaktywnego eventu odpowiedź jak przy braku zasobu: **`404`** (`Event not found`) — klient nie odróżnia „nie ma UUID” od „był, ale usunięty soft”. |
| **DELETE /events/:id** (ponownie) | **`400`** — komunikat wskazujący, że event jest już nieaktywny (brak idempotencji „cichego sukcesu” w tej wersji). |
| **Harmonogram** (`GET /schedule`, `GET /schedule/me`) | Nieaktywne eventy **nie** są zwracane w `items`. |
| **Sloty / dostępność** | Nieaktywne eventy **nie** odejmują okien czasu ani **nie blokują** rezerwacji lekcji / nowych eventów w tym samym przedziale. |
| **Lekcje** | Kolizje z instruktorem i pojazdem sprawdzane są względem **aktywnych** eventów (`lesson.service`). |
| **Przywracanie** | Brak endpointu restore (MVP). |

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
| `courseId` | string | opcjonalne UUID — **`Course.id`**; dozwolone **tylko** gdy `type === THEORY` (powiązanie wydarzenia z kursem). **Nie** powoduje automatycznego zapisu kursantów z kursu na event — lista uczestników jest pusta do momentu wywołań **`POST` / `PUT` `/events/:id/students`** (sekcja *Uczestnicy eventu THEORY*). |

**Reguły biznesowe:** start i koniec muszą leżeć w **jednej dobie kalendarzowej UTC**; miejsce w grafiku musi być w wolnym oknie po odjęciu lekcji, time blocków i innych eventów (`assertInstructorTimeWindowAvailable`). Dla **DRIVE** pojazd musi istnieć, być aktywny i należeć do szkoły, do której instruktor jest przypisany (`instructor_schools`). Gdy podano **`courseId`** przy **THEORY**, backend weryfikuje, że instruktor jest powiązany z OSK tego kursu (`assertCourseEligibleForInstructorEvent`).

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

## GET `/events/:id`

Odczyt pojedynczego eventu (`InstructorEvent`). **`data.event`** ma ten sam zestaw pól co **POST/PATCH**, ale **bez** płaskich **`instructorId`** i **`vehicleId`** — zamiast tego zagnieżdżony **`instructor`** w tym samym kształcie co przy **GET `/lessons/:id`** (`id` = `InstructorProfile.id`, `userId`, `firstName`, `lastName`, `email`, `phone`). Dodatkowo zawsze **`students`**: tablica obiektów kursantów w tym samym kształcie pól co osoba przy **GET `/lessons/:id`** (`id` = `StudentProfile.id`), dane z **`event_participants`**, kolejność jak identyfikatory w **GET `/events/:id/students`** (wg `event_participants.created_at`). Dla **THEORY** może być wiele elementów; dla **DRIVE** zwykle zero lub jeden. **Pojazd nie jest zwracany**. Odpowiedź zawsze **JSON** (w tym **404** — envelope błędu, nie HTML).

### Uwierzytelnianie i autoryzacja

- **`authMiddleware`** + **`requireMinRole('MANAGER')`** (MANAGER lub ADMIN).
- **MANAGER** — tylko gdy może zarządzać dostępnością instruktora przypisanego do eventu (`assertActorCanManageAvailability` — jak przy `PATCH /events/:id`).
- **ADMIN** — dowolny istniejący event.

### Parametry ścieżki

| Parametr | Opis |
|----------|------|
| `:id` | UUID `InstructorEvent.id` |

### Odpowiedź (200)

```json
{
  "success": true,
  "data": {
    "event": {
      "id": "<uuid>",
      "type": "THEORY",
      "courseId": "<uuid> | null",
      "startTime": "2026-04-01T08:00:00.000Z",
      "endTime": "2026-04-01T09:00:00.000Z",
      "capacity": 20,
      "createdAt": "...",
      "instructor": {
        "id": "<InstructorProfile.id>",
        "userId": "<User.id>",
        "firstName": "Jan",
        "lastName": "Kowalski",
        "email": "jan@example.com",
        "phone": "+48..."
      },
      "students": [
        {
          "id": "<StudentProfile.id>",
          "userId": "<User.id>",
          "firstName": "Anna",
          "lastName": "Nowak",
          "email": "anna@example.com",
          "phone": null
        }
      ]
    }
  }
}
```

### Kody błędów

| Kod | Sytuacja |
|-----|----------|
| **401** | Brak / niepoprawny JWT |
| **403** | Rola poniżej MANAGER; MANAGER bez uprawnień do instruktora eventu |
| **400** | Niepoprawny UUID w `:id` |
| **404** | Event nie istnieje lub jest **nieaktywny** (soft delete — `isActive = false`) |

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
| **404** | Event nie istnieje, jest **nieaktywny** (soft delete), przy zmianie instruktora — nowy instruktor nie znaleziony / nieaktywny, lub pojazd nie znaleziony (DRIVE) |
| **409** | Okno poza dostępnością; kolizja z lekcją lub innym **aktywnym** eventem; pojazd zajęty (DRIVE) |

---

## DELETE `/events/:id`

Soft delete: rekord **`InstructorEvent`** pozostaje w bazie; ustawiane jest **`isActive = false`** (kolumna `is_active`). Nie usuwa wierszy **`event_participants`**. Po usunięciu event **nie** pojawia się w **`GET /schedule`**, **`GET /schedule/me`** ani w logice **slotów / kolizji** — w tym sensie „zwalnia” przedział czasu tak, jakby zniknął z kalendarza.

### Uwierzytelnianie i autoryzacja

- **`authMiddleware`** + **`requireMinRole('MANAGER')`** (MANAGER lub ADMIN).
- **MANAGER** — tylko gdy może zarządzać dostępnością instruktora przypisanego do eventu (**`assertActorCanManageAvailability`** — ta sama reguła co przy **`PATCH /events/:id`**).
- **ADMIN** — dowolny **aktywny** (w sensie `isActive` w bazie) event; nieaktywnego nie „usuwa” ponownie bez błędu (patrz **400** poniżej).

### Parametry ścieżki

| Parametr | Opis |
|----------|------|
| `:id` | UUID `InstructorEvent.id` |

### Zachowanie serwera

1. Wyszukanie eventu po `:id`; brak rekordu → **404**.
2. Jeśli **`isActive === false`** → **400** (próba ponownego usunięcia — komunikat semantycznie: event już nieaktywny).
3. Sprawdzenie uprawnień managera do instruktora eventu.
4. **`UPDATE`** ustawiający **`is_active = false`**.

### Odpowiedź (204)

Ciało JSON zgodne z kopertą API: **`{ "success": true }`** (bez pola **`data`** — jak inne odpowiedzi 204 w projekcie, jeśli używane).

### Kody błędów

| Kod | Sytuacja |
|-----|----------|
| **401** | Brak / niepoprawny JWT |
| **403** | Rola poniżej MANAGER; MANAGER bez uprawnień do instruktora eventu |
| **400** | Niepoprawny UUID w `:id`; event **już** oznaczony jako nieaktywny |
| **404** | Brak eventu o podanym `:id` |

Implementacja: `deleteInstructorEvent` w `src/services/event.service.ts`, handler `deleteEventHandler` w `src/controllers/event.controller.ts`, trasa w `src/routes/events.routes.ts`. OpenAPI: tag **Events**, ścieżka **`DELETE /events/{id}`**.

---

## GET `/events/:id/students`

Odczyt listy **identyfikatorów użytkowników** (`User.id` / JWT subject) kursantów przypisanych do eventu. W bazie przypisanie jest przez **`EventParticipant`** (`student_id` → **`StudentProfile.id`**); endpoint zwraca **`users.id`**, tak jak pole **`studentIds`** w body **`POST /events/:id/students`** — bez dodatkowego mapowania po stronie klienta. Pełne obiekty kursantów (jak przy **GET `/lessons/:id`**) są także w **`data.event.students`** przy **GET `/events/:id`** — ten endpoint nadal jest przydatny, gdy potrzebne są wyłącznie UUID.

### Uwierzytelnianie i autoryzacja

- **`authMiddleware`** + **`requireMinRole('MANAGER')`** (MANAGER lub ADMIN).
- **MANAGER** — tylko gdy może zarządzać dostępnością instruktora przypisanego do eventu (`assertActorCanManageAvailability` — **ta sama reguła** co przy **`GET /events/:id`** i **`POST /events/:id/students`**).
- **ADMIN** — dowolny istniejący event.

### Parametry ścieżki

| Parametr | Opis |
|----------|------|
| `:id` | UUID `InstructorEvent.id` |

### Zachowanie serwera

1. Wyszukanie **`InstructorEvent`** po `:id`; brak rekordu **lub** `isActive === false` → **404** (`Event not found`).
2. Sprawdzenie uprawnień do **instruktora** tego eventu (`assertActorCanManageAvailability`).
3. Odczyt **`event_participants`** dla tego `event_id`, join do **`student_profiles`** → pole **`user_id`** (UUID konta użytkownika).
4. Kolejność w **`studentUserIds`**: rosnąco po **`event_participants.created_at`** (kto pierwszy zapisany, ten wcześniej na liście).
5. Brak uczestników → **200** z `studentUserIds: []` (nie jest to błąd).

### Odpowiedź (200)

```json
{
  "success": true,
  "data": {
    "studentUserIds": ["<uuid-users.id>", "<uuid-users.id>"]
  }
}
```

### Kody błędów

| Kod | Sytuacja |
|-----|----------|
| **401** | Brak / niepoprawny JWT |
| **403** | Rola poniżej MANAGER; MANAGER bez uprawnień do instruktora eventu |
| **400** | Niepoprawny UUID w ścieżce (`:id`) |
| **404** | Event nie istnieje lub jest **nieaktywny** (soft delete) |

Implementacja: `getEventStudentUserIds` w `src/services/event.service.ts`, handler `getEventStudentsHandler` w `src/controllers/event.controller.ts`.

---

## Uczestnicy eventu THEORY — semantyka endpointów

W bazie uczestnictwo to wiersze **`event_participants`** (powiązanie **`StudentProfile`** ↔ **`InstructorEvent`**). Dla managera **wszystkie operacje poniżej dotyczą wyłącznie eventów typu `THEORY`** (bloki jazdy `DRIVE` nie przyjmują listy uczestników tą ścieżką).

| Potrzeba | Endpoint | Co robi serwer |
|----------|----------|----------------|
| **Odczytać** kto jest zapisany | `GET /events/:id/students` | Zwraca `data.studentUserIds` (UUID kont `users.id`), kolejność wg `event_participants.created_at`. |
| **Zsynchronizować pełną listę** z UI (np. edycja całej grupy, import stanu) | `PUT /events/:id/students` | **Nadpisuje zbiór uczestników** body: po zapisie jest **dokładnie** ten zestaw `users.id`. Kogo **nie ma** w `studentIds` — zostaje **wypisany** z eventu. `studentIds: []` = **nikt** nie jest przypisany. |
| **Dopisać** osoby bez ruszania pozostałych | `POST /events/:id/students` | Tylko **dodaje** brakujących; już zapisani → licznik `skipped`, **bez** usuwania innych. |
| **Wypisać jedną** osobę | `DELETE /events/:id/students/:studentUserId` | Usuwa **jedno** powiązanie; `:studentUserId` = `users.id` kursanta (ten sam identyfikator co w tablicach GET/PUT/POST). |

**GET vs PUT/DELETE — kolejność w tablicy:** `GET` sortuje wg kolejności **zapisów**. Odpowiedzi `PUT` i `DELETE` zwracają `studentUserIds` **posortowane leksykograficznie** — **ten sam zbiór** co w GET (dla tego samego stanu bazy), tylko inna kolejność elementów.

**Kiedy użyć PUT zamiast POST:** gdy frontend trzyma **kompletną** listę wybranych kursantów i ma **zastąpić** stan serwera (np. multi-select + zapis). Samo **POST** nigdy **nie zdejmie** kogoś z listy — do tego służy **PUT** (lub **DELETE** dla pojedynczej osoby).

---

## POST `/events/:id/students`

Przypisanie **jednego lub wielu** kursantów do istniejącego eventu (`InstructorEvent`). Semantyka **„dokładka”**: istniejący u czestnicy **pozostają**; kursant już zapisany na ten event jest **pomijany** (licznik `skipped`), bez błędu. Do **pełnej podmiany** zbioru użyj **`PUT /events/:id/students`** (sekcja powyżej).

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

- Event musi mieć typ **`THEORY`** — przypisywanie kursantów do **`DRIVE`** → **422**.
- Każdy kursant musi być zapisany w **`student_schools`** do co najmniej jednej szkoły, z którą powiązany jest instruktor eventu (dla **MANAGER** — tylko OSK właściciela) → w przeciwnym razie **422**.
- Brak duplikatów w `studentIds` → **400**.
- Event nie istnieje lub jest **nieaktywny** (soft delete) → **404**.
- Którykolwiek `studentIds` nie jest aktywnym użytkownikiem z rolą **STUDENT** i profilem kursanta → **404** (`One or more students not found`).
- Po odfiltrowaniu już zapisanych: suma **obecnych uczestników + nowych** nie może przekroczyć **`capacity`**, jeśli `capacity` jest ustawione → **409**.
- Dla każdego nowego kursanta: brak nakładającego się w czasie **nieanulowanej lekcji** (`lessons`) → w przeciwnym razie **409** (`Student has a conflicting driving lesson`); brak nakładającego się w czasie innego **aktywnego** eventu, na który jest zapisany → w przeciwnym razie **409** (`Student has a conflicting scheduled event`).
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
| **404** | Event nie istnieje / nieaktywny lub kursant nie znaleziony |
| **409** | Przekroczenie `capacity` lub konflikt czasowy kursanta z innym eventem |
| **422** | Event nie **`THEORY`** albo brak przypisania kursanta do uprawionej OSK |

---

## PUT `/events/:id/students`

**Cel:** jednym żądaniem ustawić **dokładny** zestaw osób przypisanych do eventu — serwer **dopasowuje bazę** do body (dodaje brakujące powiązania, **usuwa** powiązania nie wymienione w `studentIds`). To **nie** jest operacja typu merge po jednym ID (tak działa **POST**); to **synchronizacja zbioru**.

### Przykład zachowania

- Przed: na evencie zapisani są kursanci **A, B, C**.
- Body: `{ "studentIds": ["B", "D"] }` (UUID `users.id`).
- Po **PUT:** zapisani są wyłącznie **B** i **D** (**A** i **C** zostali usunięci z tego eventu).

Pusta tablica `{ "studentIds": [] }` czyści listę uczestników (przy zachowaniu reguł typu **THEORY**).

### Uwierzytelnianie i autoryzacja

- **`Authorization: Bearer`** jak pozostałe endpointy managera.
- Jak **GET `/events/:id/students`** / **POST**: `authMiddleware`, rola **MANAGER+**, dla managera OSK — `assertActorCanManageAvailability` względem instruktora eventu.

### Parametry ścieżki

| Parametr | Opis |
|----------|------|
| `:id` | UUID `InstructorEvent.id` — ten sam zasób co w `GET /events/:id`. |

### Body (JSON)

| Pole | Typ | Walidacja |
|------|-----|-----------|
| `studentIds` | string[] | max **50** pozycji; może być **pusta** = brak uczestników; elementy = UUID **`users.id`**; **bez duplikatów** (duplikat w tablicy → **400**) |

### Reguły biznesowe

- Jak przy **POST** (typ **THEORY**, przynależność kursanta do uprawionej OSK przez `student_schools`, limit **capacity**, brak kolizji z lekcją / innym nakładającym się eventem, jedna transakcja), z tym że limit **capacity** dotyczy **końcowej** liczby `studentIds.length` (nie „obecni + nowi” jak przy POST).
- **Idempotentność:** drugie takie samo **PUT** z tą samą tablicą `studentIds` → **200**, stan bez zmiany semantycznej (ten sam zbiór w odpowiedzi).

### Odpowiedź (200)

```json
{
  "success": true,
  "data": {
    "studentUserIds": ["<uuid>", "<uuid>"]
  }
}
```

- **`studentUserIds`** — **potwierdzenie stanu po zapisie** (można odświeżyć UI bez osobnego GET). Kolejność w tablicy: **posortowana leksykograficznie**; zbiór = żądanie po unikalności UUID.

### Kody błędów

| Kod | Sytuacja |
|-----|----------|
| **401** / **403** / **404** | Jak przy GET/POST |
| **400** | Niepoprawne body, duplikaty w `studentIds`, zły format UUID |
| **409** | Przekroczenie `capacity` lub konflikt czasowy kursanta |
| **422** | Event nie **THEORY** lub kursant nie w uprawnionej OSK |

Implementacja: `replaceEventStudents` w `src/services/event.service.ts`, handler `putEventStudentsHandler`.

---

## DELETE `/events/:id/students/:studentUserId`

**Cel:** **inkrementalne** usunięcie jednej osoby z eventu — bez przesyłania pełnej listy. Nadaje się do akcji „wypisz tego kursanta” przy niezmienionej reszcie grupy. Gdy chcesz **nadpisać całą listę**, wygodniejszy jest **`PUT`** z kompletną tablicą `studentIds`.

### Parametry ścieżki

| Parametr | Opis |
|----------|------|
| `:id` | UUID `InstructorEvent.id` |
| `:studentUserId` | UUID **`users.id`** kursanta — ten sam identyfikator co wartości w `studentUserIds` / `studentIds` przy GET i PUT/POST (**nie** `StudentProfile.id` w API). |

### Uwierzytelnianie i autoryzacja

Jak przy **GET/POST/PUT** uczestników (MANAGER+, ten sam dostęp do instruktora eventu).

### Reguły biznesowe

- Event musi mieć typ **`THEORY`** — inaczej **422**.
- Kursant musi być **obecnie** zapisany na ten event — inaczej **404** (`Student is not assigned to this event`). Sam fakt istnienia konta kursanta bez przypisania do eventu kończy się tym błędem, nie **200**.

### Odpowiedź (200)

```json
{
  "success": true,
  "data": {
    "studentUserIds": ["<uuid>", "<uuid>"]
  }
}
```

- **`studentUserIds`** — kto pozostał po wypisaniu wskazanego uczestnika; kolejność jak przy **PUT** (**posortowane** UUID).

### Kody błędów

| Kod | Sytuacja |
|-----|----------|
| **401** / **403** | Jak przy innych `/events/.../students` |
| **404** | Brak eventu **albo** podany kursant nie jest na liście uczestników |
| **422** | Event nie **THEORY** |
| **400** | Niepoprawny UUID w ścieżce |

Implementacja: `removeStudentFromEvent` w `src/services/event.service.ts`, handler `deleteEventStudentsHandler`.

---

## GET `/schedule/me`

Lista pozycji terminarza zalogowanego użytkownika w zakresie dat: **lekcje** oraz **aktywne** (`isActive: true`) **eventy instruktora**, w których uczestniczy (jako kursant) lub które prowadzi (jako instruktor). Soft-deleted eventy **nie** trafiają do odpowiedzi.

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

Terminarz **wybranego** instruktora lub studenta (podgląd dla biura): lekcje oraz **wyłącznie aktywne** eventy instruktora / eventy, na które zapisany jest kursant (nieaktywne — **wykluczone**).

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

Filtrowanie: lekcje **nakładające się** na zakres `[dateFrom, dateTo]` (UTC), bez `CANCELLED`; eventy — ten sam zakres czasu (nachodzące na przedział), **z warunkiem** `isActive: true` na **`InstructorEvent`**.

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
7. **GET /events/:id:** MANAGER z OSK instruktora eventu → **200** (`data.event` z **`students`**); nieistniejący UUID → **404** (JSON); po **soft delete** tego samego ID → **404**; MANAGER innej OSK → **403**.
8. **GET /events/:id/students:** MANAGER z OSK instruktora → **200** (`data.studentUserIds`; pusta tablica jeśli nikt nie zapisany); nieistniejący lub nieaktywny event → **404**; MANAGER innej OSK → **403**.
9. **POST /events/:id/students:** MANAGER, `studentIds` = `users.id`, capacity nieprzekroczone → **200** (`assigned` / `skipped`); duplikat w tablicy → **400**; drugi **aktywny** event w tym samym czasie dla kursanta → **409**.
10. **PATCH /events/:id:** MANAGER — zmiana tylko `capacity` → **200**; zmiana czasu na ten sam slot co dotychczas → **200** (bez kolizji z samym sobą); przesunięcie na zajęty slot innego **aktywnego** eventu → **409**.
11. **DELETE /events/:id:** MANAGER z OSK instruktora → **204** (`success: true`); powtórzone DELETE na tym samym ID → **400** (już nieaktywny); nieistniejący UUID → **404**.
12. **GET /schedule** (lub **/schedule/me**): po **DELETE /events/:id** wpis `instructor_event` **nie** pojawia się w `items` dla zakresu dat obejmującego ten event.
13. **POST /events** w przedziale zwolnionym przez soft delete wcześniejszego eventu w tym samym miejscu → **201** (slot nie jest blokowany przez nieaktywny rekord).
