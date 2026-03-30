---
description: "Uwierzytelnianie (Supabase + Express) — trasy, ciasteczka, wymagania klienta"
alwaysApply: true
---

# Auth (backend)

Serwer montuje router pod **`/auth`** (`src/server.ts`). Implementacja: `src/auth/`.

## Przepływ sesji

- **Logowanie** (`POST /auth/login`): Supabase `signInWithPassword`. W odpowiedzi JSON jest m.in. **`access_token`**; **`refresh_token`** trafia do **httpOnly** ciasteczka `refresh_token` (ścieżka **`/auth`**, `sameSite: strict`, `secure` w produkcji).
- **Odświeżanie** (`POST /auth/refresh`): czyta `refresh_token` z ciasteczka, zwraca nowy **`access_token`** (JSON). Klient musi wysyłać żądanie **z ciasteczkiem** (credentials).
- **Wylogowanie** (`POST /auth/logout`): wymaga **ważnego** nagłówka `Authorization: Bearer <access_token>` (**`authMiddleware`**). Czyści ciasteczka `refresh_token` (bieżąca ścieżka + **legacy** `/auth/refresh` dla starych sesji), opcjonalnie unieważnia sesję w Supabase (`refreshSession` → `signOut`).

## Trasy i middleware

| Metoda | Ścieżka | Middleware | Uwagi |
|--------|---------|------------|--------|
| POST | `/auth/register` | `authMiddleware` | Kto może rejestrować — zasady w `registerRolePolicy.ts` |
| POST | `/auth/login` | — | Ustawia ciasteczko refresh |
| POST | `/auth/refresh` | — | Wymaga ciasteczka |
| POST | `/auth/logout` | `authMiddleware` | Wymaga Bearer; bez poprawnego JWT → **401** |
| GET | `/auth/me` | `authMiddleware` | Profil użytkownika z bazy (Prisma) |

**`authMiddleware`**: weryfikuje JWT przez Supabase `getUser`, ładuje rekord `User` z Prisma do `req.user` (m.in. rola).

## Wymagania dla frontendu

- **`POST /auth/login`**, **`POST /auth/refresh`**, **`POST /auth/logout`**: żądania z **cookies** — np. `fetch(..., { credentials: 'include' })` lub Axios **`withCredentials: true`**. Inaczej ciasteczko nie jest zapisywane / nie jest wysyłane / **nie są stosowane nagłówki kasujące ciasteczko** przy wylogowaniu.
- **`POST /auth/logout`**: dodatkowo nagłówek **`Authorization: Bearer`** z aktualnym access tokenem.
- Gdy **access token wygasł**, a w przeglądarce jest jeszcze refresh: najpierw **`POST /auth/refresh`**, potem **`POST /auth/logout`** z nowym tokenem.

## Pliki źródłowe

- `src/auth/auth.routes.ts` — definicja tras
- `src/auth/auth.controller.ts` — login, refresh, logout, register; opcje ciasteczka i odczyt `refresh_token`
- `src/auth/auth.middleware.ts` — Bearer + Prisma user
- `src/lib/supabase.ts` — klient anon (auth po stronie API)
- Ochrona innych modułów API: m.in. `src/middleware/requireAuth.ts` (Bearer + Supabase)

## Historia decyzji (skrót)

- **Logout** wymaga zalogowania (middleware), żeby uniknąć sytuacji, w której niezalogowany klient dostaje ten sam „sukces” co po realnym wylogowaniu.
- **clearCookie** używa tych samych atrybutów co `res.cookie` (`httpOnly`, `secure`, `sameSite`, `path`), żeby przeglądarka faktycznie usuła ciasteczko.
- **Dwa `clearCookie`** — jedno dla `path: '/auth'`, drugie legacy dla wcześniejszego `path: '/auth/refresh'`.
