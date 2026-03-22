---
description: "BACKEND RULES - dołączaj ten plik do kontekstu"
alwaysApply: true
---

# BACKEND RULES

CRITICAL:

1. No double booking allowed

- instructor cannot have overlapping lessons
- vehicle cannot have overlapping lessons

2. Always validate:

- lesson_type
- lesson status
- ownership (student must own lesson)

3. Use transactions when:

- creating lesson
- booking lesson

4. Availability priority:
1. leaves
1. time_blocks
1. lessons
1. working_hours

1. Do NOT trust frontend
   All validation must be backend-side.

1. Payments:

- booking may depend on payment status (configurable)

7. Soft delete:

- never hard delete important data
