---
description: 'DB CONSTRAINTS - dołączaj ten plik do kontekstu'
alwaysApply: true
---

# DB Constraints — obowiązkowe zabezpieczenia w bazie danych

Ten plik opisuje invariants, które powinny być egzekwowane na poziomie bazy danych jako "safety net" obok walidacji w backendzie. Plik jest dołączany automatycznie do kontekstu projektu.

## Cel

- Zapewnić, że krytyczne reguły biznesowe nie zostaną złamane przez bugi, skrypty lub równoległe żądania.
- Trzymać listę migracji/constraintów, które muszą istnieć w DB (np. EXCLUDE dla zakazu nakładania się lekcji).

## Zakres rekomendowanych zabezpieczeń

1. Foreign keys i UNIQUE (standardowe relacje).
2. CHECK constraints dla prostych reguł:
    - lekcja: start_time < end_time
    - jeśli lesson_type == 'PRACTICE' wtedy vehicle_id IS NOT NULL
3. EXCLUDE constraints (Postgres) dla zakazu nakładania się czasów:
    - brak overlapu lessonów dla jednego instruktora (tstzrange(start_time,end_time) &&)
    - brak overlapu lessonów dla jednego pojazdu
4. Partial unique indexy dla soft-delete-aware unikatów (np. email WHERE deleted_at IS NULL).
5. Indeksy GIN dla kolumn JSONB (user_settings, school_settings, profile.extra).
6. Indeksy czasowe i kompozytowe dla szybkiego liczenia kalendarza (instructor_id, start_time).

## Dlaczego: backend + DB

- Backend: implementuje złożoną logikę (priorytety availability, reguły płatności, fallbacky) i zwraca czytelne błędy.
- DB: finalna linia obrony — chroni przed race conditions i manualnymi zmianami bezpośrednio w DB.

## Ograniczenia i uwagi praktyczne

- EXCLUDE działa najlepiej w Postgres; jeśli używasz innej bazy, stosuj transakcje i locki aplikacyjne.
- EXCLUDE + NULL: porównania z NULL nie działają jak =; dla vehicle możesz użyć partial constraint albo polegać na CHECK (practice wymaga vehicle_id).
- Prisma nie ma natywnej składni dla EXCLUDE — dodaj raw SQL w migracji.

## Procedura wdrożenia (Postgres + Prisma)

1. Dodaj komentarze w `prisma/schema.prisma` przy modelach opisujące oczekiwane constraints.
2. Utwórz migrację Prisma (np. `prisma migrate dev --name add-db-constraints`).
3. Edytuj wygenerowany plik migracji i wstaw raw SQL (ENABLE EXTENSION + ALTER TABLE ... ADD CONSTRAINT ...).
4. Wykonaj migrację na staging i uruchom testy integracyjne (szczególnie race conditions).

## Przykładowa migracja SQL (Postgres) — wklej do migracji

```sql
-- Wymagane rozszerzenie dla EXCLUDE z btree types
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Proste CHECKy
ALTER TABLE lessons
  ADD CONSTRAINT lessons_start_before_end CHECK (start_time < end_time),
  ADD CONSTRAINT practice_requires_vehicle CHECK ((lesson_type <> 'PRACTICE') OR (vehicle_id IS NOT NULL));

-- EXCLUDE: brak nakładania się dla instruktora
ALTER TABLE lessons
  ADD CONSTRAINT no_instructor_overlap EXCLUDE USING GIST (
    instructor_profile_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  );

-- EXCLUDE: brak nakładania się dla pojazdu
ALTER TABLE lessons
  ADD CONSTRAINT no_vehicle_overlap EXCLUDE USING GIST (
    vehicle_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  );

-- Partial unique index dla soft-delete-aware unikatów
CREATE UNIQUE INDEX IF NOT EXISTS users_email_active_idx ON users (email) WHERE deleted_at IS NULL;

-- GIN indexy dla JSONB
CREATE INDEX IF NOT EXISTS idx_driving_schools_settings_gin ON driving_schools USING GIN (settings);
CREATE INDEX IF NOT EXISTS idx_users_settings_gin ON users USING GIN (settings);
```

## Fragment komentarza do `prisma/schema.prisma`

Wklej obok modelu Lesson lub na górze schema:

```prisma
// DB-level constraints expected:
//  - CHECK: start_time < end_time
//  - CHECK: if lesson_type == PRACTICE then vehicle_id IS NOT NULL
//  - EXCLUDE (Postgres): no overlapping lessons per instructor (tstzrange(start_time,end_time) &&)
//  - EXCLUDE (Postgres): no overlapping lessons per vehicle
// Note: EXCLUDE constraints must be added in a raw SQL migration.
```

## Testy i CI

- Dodaj testy integracyjne, które równolegle próbują zarezerwować ten sam slot i oczekują, że tylko jedna próba się powiedzie.
- Uruchamiaj migracje i testy DB jako część pipeline'u przed merge.

## Kontakt / autorzy

- Właściciel decyzji: [tu wpisz osobę lub zespół odpowiedzialny za migracje]

---

Plik przygotowany automatycznie na żądanie. Jeśli chcesz, mogę też przygotować gotową migrację SQL dopasowaną do aktualnego schematu (podaj nazwy tabel/kolumn, jeśli odbiegają od powyższych).
