---
description: "DATABASE OVERVIEW - dołączaj ten plik do kontekstu"
alwaysApply: true
---

# DATABASE OVERVIEW

Important relations:

User → UserProfile (`user_profiles`: opcjonalne `avatar_url`, `bio`; `updated_at` przy zmianach profilu w tym wierszu)

User → StudentProfile / InstructorProfile

Student → Courses → Lessons

Lesson:

- belongs to course
- has instructor
- has optional vehicle

Course:

- belongs to student
- belongs to driving_school
- has course_type
- API (lista, szczegóły, POST, PATCH instruktora): [courses-api.md](./courses-api.md)

Lista kursantów w OSK (paginacja, filtr kursu): [students-api.md](./students-api.md)

Payments:
Course → PaymentPlan → Payments

Availability:
Instructor:

- working_hours_default
- working_hours (override)
- time_blocks
- leaves

Calendar is computed dynamically.
