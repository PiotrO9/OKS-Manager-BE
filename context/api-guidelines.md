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

Rules:

- always validate input (zod or similar)
- return consistent responses

Response format:

{
success: boolean,
data?: any,
error?: string
}

Use pagination for lists.
