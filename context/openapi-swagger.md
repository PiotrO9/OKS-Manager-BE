---
description: "OpenAPI / Swagger UI — adresy, Zod, jak rozszerzać dokumentację API"
alwaysApply: true
---

# OpenAPI / Swagger (dokumentacja API)

Interaktywna specyfikacja i „Try it out” dla REST API. **Źródłem prawdy dla parametrów, query i JSON body** są tam, gdzie to możliwe, **te same schematy Zod**, których używają kontrolery — generowanie opisu przez [`@asteasolutions/zod-to-openapi`](https://github.com/asteasolutions/zod-to-openapi) (wersja **7.x**, zgodna z **Zod 3**).

## Adresy (środowisko lokalne)

| URL | Opis |
|-----|------|
| `GET /api-docs` | **Swagger UI** (przeglądarka); styl: ukryty pasek Swagger, włączony explorer. |
| `GET /openapi.json` | Pełny dokument **OpenAPI 3.0.3** (JSON) — Postman, codegen, CI, review. |

Domyślnie serwer nasłuchuje na **`PORT`** (np. `3001`). UI otwórz np. `http://localhost:3001/api-docs`.

## Zmienne środowiskowe

- **`PORT`** — budowa adresu serwera w polu `servers` specyfikacji, gdy nie ustawiono `API_BASE_URL`.
- **`API_BASE_URL`** (opcjonalnie) — pełny bazowy URL API (np. `https://api.example.com`). Użyteczne po wdrożeniu: **Try it out** i eksport do narzędzi wskazują właściwy host.

## Kod źródłowy (mapowanie plików)

```
src/swagger/
├── zodOpenApiInit.ts      # extendZodWithOpenApi(z) — wywołać raz, jak najwcześniej
├── openapiSpec.ts         # OpenAPIRegistry + OpenApiGeneratorV3 → dokument
├── registerOpenApiPaths.ts # registry.registerPath(...) dla każdej trasy API
└── setupSwagger.ts        # montowanie /api-docs i /openapi.json (swagger-ui-express)
```

- **`src/server.ts`** — zaraz po `dotenv/config` import **`./swagger/zodOpenApiInit`**, potem pozostałe moduły lokalne, aby obiekty Zod były tworzone już na rozszerzonych prototypach.
- **`src/schemas/instructor-availability.openapi.ts`** — re-eksport aliasów pod OpenAPI (np. `instructorId` vs `id` w ścieżkach), bez zmiany logiki walidacji w `instructor-availability.schemas.ts`.

## Obowiązek przy nowym endpoincie

1. Trasa i kontroler jak zwykle: [backend-structure.md](./backend-structure.md) (`routes` → `controllers` → walidacja Zod).
2. **Dopisz** `registry.registerPath({ ... })` w **`src/swagger/registerOpenApiPaths.ts`**:
   - `method`, `path` (notacja OpenAPI: `{id}`, nie `:id`),
   - `request`: `params` / `query` / `body` — **importuj te same** `z.object(...)` / eksporty z `schemas/*.ts` lub `lib/validation/uuid.ts`, które passesz w `safeParse` w kontrolerze.
   - `responses`: dla większości tras używane są uogólnione koperty sukcesu/błędu; szczegóły pól w `data` są w `context/*-api.md` i w kodzie serwisu.
3. `tags` i `summary` utrzymuj spójnie z domeną (Auth, Courses, …).

## Uwierzytelnianie w specyfikacji

Zdefiniowany jest schemat **`bearerAuth`** (JWT). Chronione operacje mają `security: [{ bearerAuth: [] }]`. **Refresh token** jest w **httpOnly** cookie — Swagger nie nadaje się do pełnego testu `POST /auth/refresh` bez ręcznej konfiguracji cookies; opis przepływu: [auth.md](./auth.md).

## Ograniczenia dokumentu

- **Multipart** (`POST /auth/profile/avatar`, `POST /vehicles/:id/photo`): w OpenAPI opisane słownie (pole `file`); pełny `multipart/form-data` nie jest rozwinięty w schemacie.
- Część body (np. upsert/patch pojazdu) w kodzie jest **poziomym `Record`** bez Zod — w specyfikacji jest **`z.record(z.unknown())`** z adnotacją, by patrzeć w serwis.
- **`POST /auth/register`**: uproszczony Zod pod dokumentację; pełne reguły RBAC i pól: [auth.md](./auth.md).

## Powiązane

- Format odpowiedzi JSON: [api-guidelines.md](./api-guidelines.md).
- Konkretne zasoby (OSK, kursy, kursanci, …): pliki `context/*-api.md`.
