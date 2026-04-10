---
description: "Struktura katalogów backendu — warstwy src/ (Cursor)"
alwaysApply: true
---

# Struktura backendu (`src/`)

Express + TypeScript + Prisma. Kod jest ułożony **warstwowo** (nie w folderach domenowych typu `vehicles/*` z wszystkim razem).

## Drzewo (skrót)

```
src/
├── server.ts              # punkt wejścia, createApp(), mount routerów, error middleware
├── routes/                # Router Express: ścieżki, kolejność middleware, multer itd.
├── controllers/         # Handlery HTTP: walidacja wejścia (Zod / requireUser), odpowiedzi JSON
├── services/            # Logika domenowa, Prisma, integracje (np. vehicle.service, userProfile.service); rzuca AppError
├── schemas/             # Zod + funkcje parse (np. body pojazdu, szkoły jazdy)
├── middleware/          # authMiddleware, requireMinRole itd.
├── lib/                   # Wspólne: prisma, supabase, supabaseStorage (MIME / storage helpers), apiResponse, validation/uuid, policies
├── swagger/               # OpenAPI: init Zod, registerPath, generator, Swagger UI — zob. context/openapi-swagger.md
└── types/                 # Rozszerzenia globalne (np. Express.Request.user)
```

## Gdzie dodać nową funkcję API

1. **`routes/<obszar>.routes.ts`** — prefiks ścieżki, `authMiddleware`, `asyncHandler`, ewentualnie upload.
2. **`controllers/<obszar>.controller.ts`** — cienka warstwa: `requireUser`, `safeParse` schematów, `sendJsonSuccess`, **bez** dużych zapytań Prisma w jednym bloku handlera.
3. **`services/<obszar>.service.ts`** (lub rozszerzenie istniejącego serwisu) — transakcje, reguły własności, konflikty; **`throw AppError.*`** zamiast ręcznego `sendJsonError` w wielu miejscach.
4. **`schemas/<obszar>.schemas.ts`** — gdy potrzebny Zod lub powtarzalny parse (zgodnie z [api-guidelines.md](./api-guidelines.md)).
5. **`src/swagger/registerOpenApiPaths.ts`** — dopisz `registry.registerPath` dla nowej trasy (te same schematy Zod co w kontrolerze), patrz [openapi-swagger.md](./openapi-swagger.md).

Polityki i stałe reguły (np. kto może kogo rejestrować): **`lib/`** (np. `registerRolePolicy.ts`).

## Zasady

- **Nie** wrzucać całej logiki biznesowej tylko do kontrolera — serwis ma być testowalny i jednym miejscem na reguły.
- Błędy operacyjne: **`AppError`** + globalny **`errorRequestHandler`** w `server.ts`.
- Wspólne UUID / query: **`lib/validation/uuid.ts`** — unikaj kopiowania regexów w modułach.

## Powiązane konteksty

- API i koperty odpowiedzi: [api-guidelines.md](./api-guidelines.md)
- OpenAPI / Swagger: [openapi-swagger.md](./openapi-swagger.md)
- Auth (w tym profil, avatar, `/auth/profile`): [auth.md](./auth.md)
- OSK (endpointy): [driving-schools-api.md](./driving-schools-api.md)
- Pojazdy: [vehicles-api.md](./vehicles-api.md)
- Kursanci: [students-api.md](./students-api.md)
- Reguły krytyczne (rezerwacje, transakcje): [backend-rules.md](./backend-rules.md)
