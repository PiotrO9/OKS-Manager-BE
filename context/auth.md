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

## Rejestracja (`POST /auth/register`)

**Middleware:** `authMiddleware`. **Kto może kogo zarejestrować:** `registerRolePolicy.ts`.

**Przepływ:** Supabase `auth.signUp` → zapis w aplikacji (`User` w Prisma). `id` użytkownika w `public.users` jest **taki sam** jak w Supabase Auth (`auth.users`), żeby sesja i rekord aplikacji były spójne.

### Body (JSON)

| Pole | Wymagane | Uwagi |
|------|----------|--------|
| `email`, `password`, `role`, `firstName`, `lastName` | tak | `role`: `STUDENT` lub `INSTRUCTOR` |
| `phone` | nie | |
| `licenseNumber` | tak, gdy `role` = `INSTRUCTOR` | W modelu `InstructorProfile` pole `license_number` jest wymagane — brak → **400** (`licenseNumber is required when role is INSTRUCTOR`) |

### Profile roli (Prisma)

Po udanym zapisie użytkownika backend **z poziomu aplikacji** tworzy powiązany profil (bez triggerów w Supabase / PostgreSQL):

- **`STUDENT`** — wiersz w `student_profiles` (`user_id` → `users.id`; `pesel` opcjonalny).
- **`INSTRUCTOR`** — wiersz w `instructor_profiles` z przekazanym `licenseNumber`.

Gdy użytkownik już istnieje w bazie po tym samym `id` (np. powtórne wywołanie rejestracji), wykonywane jest `user.update`; jeśli brakuje profilu danej roli, jest on **dopisany w tej samej transakcji** co aktualizacja użytkownika.

Implementacja: `src/auth/auth.controller.ts` (`buildUserCreateWithRoleProfiles`, `ensureRoleProfilesAfterUserUpsert`).

**Supabase:** nie trzeba konfigurować triggerów na `auth.users` ani logiki profili w panelu — tabele `public.*` obsługuje backend przez `DATABASE_URL` / Prisma.

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

- **Profile przy rejestracji** (`student_profiles` / `instructor_profiles`) są tworzone w warstwie aplikacji (Prisma, transakcje), a nie triggerami w bazie — prostsze utrzymanie i spełnienie pól wymaganych (np. numer licencji instruktora).
- **Logout** wymaga zalogowania (middleware), żeby uniknąć sytuacji, w której niezalogowany klient dostaje ten sam „sukces” co po realnym wylogowaniu.
- **clearCookie** używa tych samych atrybutów co `res.cookie` (`httpOnly`, `secure`, `sameSite`, `path`), żeby przeglądarka faktycznie usuła ciasteczko.
- **Dwa `clearCookie`** — jedno dla `path: '/auth'`, drugie legacy dla wcześniejszego `path: '/auth/refresh'`.
