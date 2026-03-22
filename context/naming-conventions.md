---
description: "NAMING CONVENTIONS - dołączaj ten plik do kontekstu"
alwaysApply: true
---

# NAMING CONVENTIONS

Ten plik definiuje konwencje nazewnicze używane w projekcie — zarówno w warstwie bazy danych, jak i w Prisma/backend (JS/TS). Plik jest dołączany do kontekstu projektu i powinien być punktualnym źródłem prawidłowych wzorców.

## Ogólne zasady
- Stosuj spójność: nazewnictwo ma ułatwiać czytanie kodu i migracje.
- DB = snake_case + plural table names.
- Backend/Prisma = PascalCase dla modeli, camelCase dla pól.
- Mapuj pola modeli Prisma na kolumny DB przez `@map` i mapuj modele na tabele przez `@@map`.

## Baza danych (Postgres)
- Tabele: snake_case, plural — np. `users`, `driving_schools`, `instructor_profiles`.
- Kolumny: snake_case — np. `created_at`, `instructor_id`, `start_time`.
- Klucz główny: `id` (autoincrement int lub uuid, trzymaj spójnie w całym projekcie).
- Timestampy: `created_at`, `updated_at`, `deleted_at` (soft delete).
- Join/pivot tables: plural_plural, np. `instructor_schools`, `student_schools`.

## Prisma (schema.prisma)
- Modele: PascalCase singular — `User`, `DrivingSchool`, `Lesson`.
- Pola: camelCase — `createdAt`, `startTime`, `instructorId`.
- Mapowanie DB: używaj `@map("snake_case_name")` dla pól i `@@map("table_name")` dla modelu.
- Relacje: deklaruj `onDelete` i używaj nazewnictwa relacji czytelnego w kodzie.
- Enums: nazwij je PascalCase w Prisma, wartości UPPER_CASE.

Przykład:

```prisma
model Lesson {
  id           Int       @id @default(autoincrement()) @map("id")
  courseId     Int       @map("course_id")
  instructorId Int       @map("instructor_id")
  startTime    DateTime  @map("start_time")
  endTime      DateTime  @map("end_time")

  @@index([instructorId, startTime], name: "idx_lessons_instructor_id_start_time")
  @@map("lessons")
}
```

## Indexy, unikatowości, constrainty
- Indexy: `idx_<table>_<col>[_<col2>]` — np. `idx_lessons_instructor_id_start_time`.
- Unikat: `uq_<table>_<col>` lub `uq_<table>_<col1>_<col2>` — np. `uq_users_email_active`.
- CHECK: `chk_<table>_<meaning>` — np. `chk_lessons_start_before_end`.
- EXCLUDE / specjalne constrainty: `no_<entity>_<meaning>` — np. `no_instructor_overlap`.

## Enums i wartości słownikowe
- W DB wartości enumów używaj UPPER_CASE (także w Prisma wartości powinny być UPPER_CASE).
- Przykład: `LessonType { THEORY PRACTICE }`.

## JSONB / metadata
- Pola JSONB nazywaj `settings` lub `metadata` — np. `school_settings.settings`.
- Dodaj GIN index: `idx_<table>_settings_gin`.
- Jeśli często filtrujesz po konkretnym polu w JSON, rozważ GENERATED column lub osobne kolumny.

## Nazwy migracji / SQL constraints
- Nazwy constraintów i indexów powinny być deterministyczne i zgodne z regułą powyżej — ułatwia review i rollback.

## Style dodatkowe
- Zawsze dodawaj `created_at` i `updated_at` (i `deleted_at` jeśli stosujesz soft-delete).
- Prefiksuj pola boolean z `is_` jeśli dotyczy (np. `is_active`, `is_day_off`).

---

Jeżeli chcesz, mogę automatycznie zrefaktoryzować `prisma/schema.prisma`, aby wszędzie dodać `@map` i `@@map` zgodnie z tymi regułami — potwierdź, a wykonam zmiany w pliku `prisma/schema.prisma` oraz dopiszę komentarze przypominające o DB-level constraints (EXCLUDE/CHECK) w `context/db_constraints.md`.