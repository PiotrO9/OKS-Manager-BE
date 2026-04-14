---
description: "DATABASE OVERVIEW - dołączaj ten plik do kontekstu"
alwaysApply: true
---

# DATABASE OVERVIEW

Important relations:

User → UserProfile (`user_profiles`: opcjonalne `avatar_url`, `bio`; `updated_at` przy zmianach profilu w tym wierszu)

User → StudentProfile / InstructorProfile (**`student_profiles`**: m.in. opcjonalne **`notes`** — tekst, edycja przez **`PATCH /students/:userId`**)

Student → Courses (przez **`course_participants`**, pole **`status`**: enum **`CourseParticipantStatus`** — **`ACTIVE`** domyślnie, **`FINISHED`**; w MVP tylko ręczna zmiana API, patrz [students-api.md](./students-api.md)) → Lessons

Lesson:

- belongs to course
- has instructor
- has optional vehicle

Course:

- belongs to student
- belongs to driving_school
- has course_type
- API (lista, szczegóły, POST, PATCH instruktora): [courses-api.md](./courses-api.md)

Lista kursantów w OSK (paginacja, filtr kursu) i szczegóły z kursami: [students-api.md](./students-api.md)

Payments:
Course → PaymentPlan → Payments

Availability:
Instructor:

- working_hours_default
- working_hours (override)
- time_blocks
- leaves

**InstructorEvent** (`instructor_events`): blok czasu przypisany do instruktora; enum **`EventType`**: **`DRIVE`** (wymaga `vehicle_id`) | **`THEORY`**; opcjonalne **`course_id`** (powiązanie z kursem przy teorii); opcjonalne **`capacity`** (limit uczestników); kolumna **`is_active`** (BOOLEAN, domyślnie `true`) — **soft delete**: przy `false` rekord nadal istnieje, ale API harmonogramu i moduły slotów / kolizji traktują go jak nieobecny (filtr `isActive: true` w zapytaniach); endpoint **`DELETE /events/:id`** ustawia `is_active = false` (bez kasowania **`event_participants`** w MVP). Przypisania kursantów na event: wyłącznie **`event_participants`** (M:N `StudentProfile` ↔ event) — **nie** są wypełniane automatycznie z listy uczestników kursu przy tworzeniu eventu. Szczegóły zachowania API: [events-schedule-api.md](./events-schedule-api.md) (sekcja *Soft delete — zachowanie*).

Calendar is computed dynamically.

## Prisma Client po `npm install`

Skrypt **`postinstall`** w `package.json` uruchamia `prisma generate` — klient jest generowany po instalacji zależności (bez ręcznego kroku).
