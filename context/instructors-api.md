---
description: "API — instruktorzy (/instructors): list, szczegóły, PATCH, DELETE (soft), role, kody odpowiedzi"
alwaysApply: true
---

# Instructors — API

Montowanie w `src/server.ts` pod prefiksem **`/instructors`**.

Implementacja: `src/routes/instructors.routes.ts`, `src/controllers/instructors.controller.ts`, `src/services/instructor.service.ts`, walidacja body PATCH: `src/lib/validation/instructorAdminPatch.ts`.

## Uwierzytelnianie i autoryzacja

- Nagłówek **`Authorization: Bearer <access_token>`** (jak przy `GET /auth/me`).
- Wszystkie trasy: **`authMiddleware`** + **`requireMinRole('MANAGER')`** (w praktyce MANAGER lub ADMIN — STUDENT / INSTRUCTOR nie przechodzą).

Szczegóły sesji: [auth.md](./auth.md).

## Trasy

| Metoda | Ścieżka | Opis |
|--------|---------|------|
| GET | `/instructors?schoolId=<uuid>` | Lista instruktorów przypisanych do szkoły (tylko aktywni `User`). Dostęp: właściciel OSK lub ADMIN. |
| GET | `/instructors/:id` | Szczegóły instruktora. Dostęp: właściciel co najmniej jednej OSK powiązanej z profilem instruktora; inaczej **403**. |
| PATCH | `/instructors/:id` | Częściowa aktualizacja profilu. **MANAGER:** ten sam zakres co GET (własna OSK). **ADMIN:** dowolny aktywny instruktor (`INSTRUCTOR`, `isActive`, bez `deletedAt`). |
| DELETE | `/instructors/:id` | Soft delete: ustawia `users.is_active = false` dla konta instruktora (bez usuwania z Supabase Auth). **MANAGER** jak PATCH (własna OSK); **ADMIN** — dowolny aktywny instruktor. **204** bez body. |

Wszystkie zapytania listujące / odczyt / zapis traktują jako „istniejącego” instruktora tylko powiąznego **aktywnego** użytkownika (`role` = `INSTRUCTOR`, `is_active`, brak `deleted_at`).

## PATCH — body (JSON)

Dozwolone (wszystkie opcjonalne; brak pól lub `{}` → no-op, **200** z bieżącym stanem):

| Pole | Typ | Walidacja |
|------|-----|-----------|
| `firstName` | string | jeśli obecne: po trim min. 1 znak |
| `lastName` | string | jak wyżej |
| `experienceYears` | number | jeśli obecne: liczba całkowita 0–80 |
| `qualifications` | string | jeśli obecne: string (może być pusty `""`) |

**Nieznane klucze** w body są **usuwane** (Zod `.strip()`), nie powodują **400**.

Prisma **nigdy** nie dostaje surowego `req.body` — tylko zwhitelistowane pola z serwisu.

## PATCH — odpowiedź (200)

`data`: `id`, `firstName`, `lastName`, `email`, `experienceYears`, `qualifications` (`string | null`).

## GET szczegółów — dodatkowe pola

Oprócz powyższych (w szerszym kształcie): `userId`, `phone`, `licenseNumber`, `schoolIds`, `qualifications`.

## Kody błędów

| Kod | Sytuacja |
|-----|----------|
| **401** | Brak / niepoprawny JWT (`authMiddleware`) |
| **403** | Rola poniżej MANAGER; MANAGER bez powiązania instruktora z własną OSK (GET / PATCH / DELETE); konto wyłączone (middleware auth) |
| **400** | Niepoprawny `schoolId` (lista); niepoprawny UUID `:id`; niepoprawne body PATCH (np. pusty `firstName` po trim, `experienceYears` spoza zakresu) |
| **404** | Brak profilu; użytkownik nie jest aktywnym instruktorem (GET / PATCH / DELETE jak „not found”; powtórny DELETE po dezaktywacji też **404**) |

## Migracje

Po dodaniu kolumny `qualifications` na `instructor_profiles` uruchom migracje / `prisma migrate` oraz **`prisma generate`**, żeby typy klienta były spójne ze schematem.

---

## Checklist smoke (ręczna)

1. **PATCH MANAGER:** `lastName` tylko → **200**, zmiana w DB; ten sam użytkownik, inny instruktor nie z własnej OSK → **403**.
2. **PATCH ADMIN:** dowolny aktywny instruktor → **200**; nieistniejący UUID → **404**; wyłączony instruktor → **404**.
3. **PATCH:** body `{}` → **200**, brak zmian w DB.
4. **PATCH:** nadmiarowe pole `email` w JSON → **200** (pole odrzucone przez strip), email bez zmian.
5. **PATCH:** `firstName: ""` lub same spacje → **400**.
6. **GET /:id:** odpowiedź zawiera `qualifications` (null lub tekst).
7. **DELETE MANAGER:** instruktor ze swojej OSK → **204**; bez powiązania → **403**; po DELETE GET → **404**.
8. **DELETE ADMIN:** aktywny instruktor → **204**; już wyłączony → **404**.
