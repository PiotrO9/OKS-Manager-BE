---
description: "Uwierzytelnianie (Supabase + Express) — trasy, ciasteczka, wymagania klienta"
alwaysApply: true
---

# Auth (backend)

Serwer montuje router pod **`/auth`** (`src/server.ts`). Implementacja: `src/routes/auth.routes.ts` + `src/controllers/auth.controller.ts`.

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
| GET | `/auth/me` | `authMiddleware` | Zbiór pól użytkownika + profil (patrz poniżej) |
| PATCH | `/auth/profile` | `authMiddleware` | Aktualizacja profilu — zob. poniżej (RBAC po polach; co najmniej jedno pole) |
| POST | `/auth/profile/avatar` | `authMiddleware` | Upload avatara do Supabase Storage (multipart, pole `file`) |

**`authMiddleware`**: weryfikuje JWT przez Supabase `getUser`, ładuje rekord `User` z Prisma (z `include: { profile: true }`) do `req.user`. Trasy chronione (pojazdy, szkoły jazdy itd.) używają tego samego middleware.

### GET `/auth/me` — odpowiedź i błędy

**Sukces (200):** `{ "success": true, "data": { "user": { ... } } }` — pole `user` zawiera m.in.:

| Pole | Typ | Uwagi |
|------|-----|--------|
| `id` | string (UUID) | |
| `name` | string | Z `firstName` + `lastName`; gdy puste — fallback do `email` |
| `firstName` | string | |
| `lastName` | string | |
| `email` | string | |
| `phone` | string \| null | Z `users.phone` |
| `avatarUrl` | string \| null | Publiczny URL z Supabase Storage, zapis w `user_profiles.avatar_url` |
| `bio` | string \| null | `user_profiles.bio` |
| `profileUpdatedAt` | string (ISO date) \| null | `user_profiles.updated_at` (brak wiersza profilu → `null`) |
| `role` | enum | `STUDENT`, `INSTRUCTOR`, … |

**Błędy:**

| Kod | Sytuacja |
|-----|----------|
| **401** | Brak/niepoprawny `Authorization: Bearer`, wygasły lub niepoprawny JWT |
| **403** | Konto usunięte (`deletedAt`) lub wyłączone (`isActive: false`) — te same komunikaty co przy `POST /auth/login` |
| **404** | Brak wiersza `users` dla id z tokenu Supabase |

## Rejestracja (`POST /auth/register`)

**Middleware:** `authMiddleware`. **Kto może kogo zarejestrować:** `registerRolePolicy.ts`.

**Przepływ (skrót):** walidacja body i uprawnień → dla `role === INSTRUCTOR` wymagane jest poprawne **`schoolId`** (sprawdzenie **przed** `signUp`, żeby unikać zbędnych kont tylko w Auth) → Supabase `auth.signUp` → w jednej transakcji Prisma: zapis `User` / aktualizacja, profile roli, oraz dla instruktora z `schoolId`: **`instructor_schools`** + **`instructor_working_hours_default`**. `id` użytkownika w `public.users` jest **taki sam** jak w Supabase Auth (`auth.users`).

### Body (JSON)

| Pole | Wymagane | Uwagi |
|------|----------|--------|
| `email`, `password`, `role`, `firstName`, `lastName` | tak | `role`: `STUDENT` lub `INSTRUCTOR` |
| `phone` | nie | |
| `licenseNumber` | tak, gdy `role` = `INSTRUCTOR` | W modelu `InstructorProfile` pole `license_number` jest wymagane — brak → **400** (`licenseNumber is required when role is INSTRUCTOR`) |
| `schoolId` | tak, gdy `role` = `INSTRUCTOR` | UUID OSK. Brak / pusty / nieprawidłowy format → **400** (`schoolId is required when role is INSTRUCTOR` lub `Invalid schoolId`). **Przed** `signUp` — nie wywołujemy Supabase przy tych błędach. Dla `STUDENT` (i każdej roli innej niż `INSTRUCTOR`) pole jest **całkowicie ignorowane** (brak walidacji i nie powoduje błędów). |

**Przypisanie instruktora do OSK:** wywołujący musi mieć co najmniej **`MANAGER`** (w praktyce rejestruje instruktora już tylko `ADMIN` / `MANAGER` wg `registerRolePolicy`) oraz prawo do szkoły: **właściciel** aktywnej OSK (`owner_id`) lub rola **`ADMIN`** (dowolna aktywna szkoła). Inaczej → **403**. Nieistniejąca lub usunięta szkoła → **400** `Invalid schoolId`.

Jeśli rekord `users` z tym samym **`email`** ma już profil instruktora z co najmniej jednym wpisem w **`instructor_schools`** → **409** (`Instructor is already assigned to a driving school`) — nadal **przed** `signUp` (jeśli uda się to stwierdzić z bazy).

**Domyślne godziny pracy** (`instructor_working_hours_default`): z `school_settings` danej OSK (`working_days_mask`, godziny rozpoczęcia/końca); bit `d` maski odpowiada `Date.getDay()` (0 = niedziela … 6 = sobota). Gdy brak ustawień, pusta maska lub `end <= start`, używany jest fallback **pn–pt 8:00–18:00**.

### Profile roli i `user_profiles` (Prisma)

Po udanym zapisie użytkownika backend **z poziomu aplikacji** tworzy powiązane rekordy (bez triggerów w Supabase / PostgreSQL):

- **`user_profiles`** — zawsze przy nowej rejestracji (`profile: { create: {} }`); `avatar_url`, `bio` mogą być puste; `updated_at` utrzymuje Prisma (`@updatedAt`).
- **`STUDENT`** — wiersz w `student_profiles` (`user_id` → `users.id`; `pesel` opcjonalny).
- **`INSTRUCTOR`** — wiersz w `instructor_profiles` z przekazanym `licenseNumber`; przy podanym `schoolId` dodatkowo **`instructor_schools`** oraz **`instructor_working_hours_default`** (logika: `src/lib/instructorSchoolRegistration.ts`, `src/lib/instructorDefaultWorkingHours.ts`).

Gdy użytkownik już istnieje w bazie po tym samym `id` (np. powtórne wywołanie rejestracji), wykonywane jest `user.update`; jeśli brakuje **profilu roli** albo **`user_profiles`**, jest on **dopisywany** w tej samej transakcji co aktualizacja użytkownika (`ensureRoleProfilesAfterUserUpsert`).

Implementacja: `src/controllers/auth.controller.ts` (`buildUserCreateWithRoleProfiles`, `ensureRoleProfilesAfterUserUpsert`).

### PATCH `/auth/profile`

**Kontekst:** zawsze **własny** użytkownik z JWT (`req.user`). Dodatkowe pola w body (poza tabelą) są ignorowane.

**Body (JSON):** wymagane jest **co najmniej jedno** z poniższych kluczy — inaczej **400** (`At least one of bio, phone, firstName, lastName is required`).

| Pole | Kto może wysłać | Uwagi |
|------|-----------------|--------|
| `bio` | Dowolna zalogowana rola | String lub `null` (wyczyszczenie). Max **2000** znaków — dłużej → **400**. |
| `phone` | Dowolna zalogowana rola | String lub `null`; pusty string po trim → `null` w `users.phone`. |
| `firstName` | Tylko **`MANAGER`**, **`ADMIN`** | Niepusty string po trim; max **100** znaków; typ inny niż string → **400**. |
| `lastName` | Tylko **`MANAGER`**, **`ADMIN`** | Jak `firstName`. |

Jeśli w body występuje klucz `firstName` i/lub `lastName` (`Object.prototype.hasOwnProperty`), a rola wywołującego to **`STUDENT`** lub **`INSTRUCTOR`**, odpowiedź **403** `Forbidden` (bez zapisu; także gdy równolegle podano `phone` / `bio`).

**Sukces (200):** `{ "success": true, "data": { "ok": true, "user": { ... } } }` — kształt `user` jak przy **GET `/auth/me`** (świeże dane po zapisie).

**Logika:** `phone` / `firstName` / `lastName` → `users` (jeden `update` w transakcji); `bio` → `user_profiles` przez **upsert** (nie nadpisuje `avatar_url` przy samym patchu tekstu). Walidacja → **400** (`AppError`).

**Błędy (typowe):** **401** — jak przy innych trasach z `authMiddleware`; **403** — próba `firstName` / `lastName` przez kursanta lub instruktora (oraz konto usunięte/wyłączone jak przy middleware); **400** — walidacja; **404** po zapisie przy braku wiersza `users` jest mało prawdopodobne.

### POST `/auth/profile/avatar`

**Wejście:** `multipart/form-data`, pole pliku **`file`** (jak przy `POST /vehicles/:id/photo`).

- Dozwolone MIME: **`image/jpeg`**, **`image/png`**, **`image/webp`**.
- Limit rozmiaru: **5 MB**; przekroczenie → **400** `file too large (max 5 MB)`.

**Sukces (200):** `{ "success": true, "data": { "photoUrl": "<public_url>" } }` — URL zapisany w `user_profiles.avatar_url`. Poprzedni obiekt w buckecie jest usuwany **best-effort** (tylko gdy URL wskazywał na ten sam bucket i można wyliczyć ścieżkę).

**Storage:** Supabase Admin (`SUPABASE_SERVICE_ROLE_KEY`), bucket z env **`SUPABASE_AVATARS_BUCKET`** (domyślnie `avatars`). Odczyt dla frontu: **publiczny URL** (`getPublicUrl`) — bucket / polityki muszą na to pozwalać (jak przy zdjęciach pojazdów). Szczegóły env: `.env.example`.

**Błędy typowe:** **400** (brak pliku, zły typ), **500** (brak konfiguracji storage), **502** (upload do Supabase nieudany).

**Supabase:** nie trzeba konfigurować triggerów na `auth.users` ani logiki profili w panelu — tabele `public.*` obsługuje backend przez `DATABASE_URL` / Prisma.

## Wymagania dla frontendu

- **`POST /auth/login`**, **`POST /auth/refresh`**, **`POST /auth/logout`**: żądania z **cookies** — np. `fetch(..., { credentials: 'include' })` lub Axios **`withCredentials: true`**. Inaczej ciasteczko nie jest zapisywane / nie jest wysyłane / **nie są stosowane nagłówki kasujące ciasteczko** przy wylogowaniu.
- **`POST /auth/logout`**: dodatkowo nagłówek **`Authorization: Bearer`** z aktualnym access tokenem.
- Gdy **access token wygasł**, a w przeglądarce jest jeszcze refresh: najpierw **`POST /auth/refresh`**, potem **`POST /auth/logout`** z nowym tokenem.

## Pliki źródłowe

- `src/routes/auth.routes.ts` — definicja tras (w tym `multer` dla avatara)
- `src/controllers/auth.controller.ts` — login, refresh, logout, register, `getMe`, `patchProfile`, `uploadProfileAvatar`
- `src/services/userProfile.service.ts` — patch profilu (`bio`, `phone`, `firstName`, `lastName` wg reguł w kontrolerze), upload avatara, upsert `user_profiles`
- `src/lib/supabaseStorage.ts` — wspólne MIME / ścieżka publicznego URL / usuwanie obiektów (też używane przy zdjęciach pojazdów)
- `src/middleware/auth.middleware.ts` — Bearer + Prisma user (`include: { profile: true }`)
- `src/lib/registerRolePolicy.ts` — kto może zarejestrować jaką rolę
- `src/lib/supabase.ts` — klient anon (auth po stronie API)
- `src/lib/supabaseAdmin.ts` — klient service role (Storage)

## Historia decyzji (skrót)

- **Profile przy rejestracji** (`student_profiles` / `instructor_profiles`) są tworzone w warstwie aplikacji (Prisma, transakcje), a nie triggerami w bazie — prostsze utrzymanie i spełnienie pól wymaganych (np. numer licencji instruktora).
- **Logout** wymaga zalogowania (middleware), żeby uniknąć sytuacji, w której niezalogowany klient dostaje ten sam „sukces” co po realnym wylogowaniu.
- **clearCookie** używa tych samych atrybutów co `res.cookie` (`httpOnly`, `secure`, `sameSite`, `path`), żeby przeglądarka faktycznie usuła ciasteczko.
- **Dwa `clearCookie`** — jedno dla `path: '/auth'`, drugie legacy dla wcześniejszego `path: '/auth/refresh'`.
- **Profil aplikacji** (`user_profiles`) jest tworzony przy rejestracji i może być uzupełniany przez `PATCH /auth/profile` oraz `POST /auth/profile/avatar`; avatary trafiają do osobnego bucketa Storage (`SUPABASE_AVATARS_BUCKET`).
