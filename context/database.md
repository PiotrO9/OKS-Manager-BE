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

**InstructorEvent** (`instructor_events`): blok czasu przypisany do instruktora; enum **`EventType`**: **`DRIVE`** (opcjonalnie `vehicle_id`) | **`THEORY`**; używany w kalendarzu do blokowania slotów obok lekcji i time blocków. API: [events-schedule-api.md](./events-schedule-api.md).

Calendar is computed dynamically.
