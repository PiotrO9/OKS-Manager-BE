---
description: "DOMAIN - dołączaj ten plik do kontekstu"
alwaysApply: true
---

# DOMAIN: Driving School Management System (OSK)

System supports:

- students (kursanci)
- instructors (instruktorzy)
- managers (szefowie OSK)
- admins

Core entities:

- driving_schools
- users
- courses
- lessons
- vehicles
- payments

Key assumptions:

- One user has exactly one role
- One student can have multiple courses
- Each course has a course_type (B, C, etc.)
- Lessons belong to a course

Lesson types:

- theory
- practice

Constraints:

- Only practice lessons require vehicle
- Only completed practice lessons can be rated
