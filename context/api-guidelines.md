---
description: "API GUIDELINES - dołączaj ten plik do kontekstu"
alwaysApply: true
---

# API GUIDELINES

Style:

- REST API
- resource-based

Examples:

GET /courses
POST /courses
GET /lessons
POST /lessons/book
GET /driving-schools

Rules:

- always validate input (zod or similar)
- return consistent responses

Authentication (Bearer, httpOnly refresh cookie, `/auth/*`): zob. [auth.md](./auth.md).

Lista OSK dla zalogowanego użytkownika (role, kody błędów): zob. [driving-schools-api.md](./driving-schools-api.md).

Kursy (lista, szczegóły, POST, PATCH instruktora): zob. [courses-api.md](./courses-api.md).

Kursanci (lista z paginacją i filtrem kursu, szczegóły z kursami i statusem uczestnictwa **ACTIVE**/**FINISHED**, wpis na kurs, **PATCH** statusu uczestnictwa, PATCH OSK/PKK): zob. [students-api.md](./students-api.md).

Response format:

{
success: boolean,
data?: any,
error?: string
}

Use pagination for lists.
