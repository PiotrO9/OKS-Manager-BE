---
description: "API — pojazdy (/vehicles): role MANAGER, body, zdjęcia, kody odpowiedzi"
alwaysApply: true
---

# Vehicles — API

Montowanie w `src/server.ts` pod prefiksem **`/vehicles`**.

Implementacja: `src/routes/vehicles.routes.ts`, `src/controllers/vehicles.controller.ts`, `src/services/vehicle.service.ts`, `src/schemas/vehicle.schemas.ts`. Wspólne typy MIME i helpery ścieżek publicznego Storage: `src/lib/supabaseStorage.ts` (używane też przy uploadzie avatara użytkownika — [auth.md](./auth.md)).

## Uwierzytelnianie i autoryzacja

- Nagłówek **`Authorization: Bearer <access_token>`** (jak przy `GET /auth/me`).
- Na wszystkich trasach poniżej: **`authMiddleware`** + **`requireMinRole('MANAGER')`** — wyłącznie użytkownik z rolą co najmniej **MANAGER** (właściciel OSK w praktyce).

Szczegóły sesji: [auth.md](./auth.md).

## Trasy

| Metoda | Ścieżka | Opis |
|--------|---------|------|
| GET | `/vehicles?schoolId=<uuid>` | Lista **aktywnych** pojazdów (`isActive: true`) dla szkoły. Wymagany poprawny `schoolId`. Opcjonalnie **`startTime`** i **`endTime`** (oba, ISO 8601 datetime) — z listy wykluczane są pojazdy zajęte w tym oknie (kolizja z lekcją lub eventem DRIVE). W odpowiedzi m.in. `vehicles[]` z polem `isDefault` oraz `defaultVehicleId`. |
| GET | `/vehicles/:id` | Szczegóły pojazdu + `isDefault`. Dostęp tylko, gdy użytkownik jest właścicielem szkoły pojazdu. |
| POST | `/vehicles` | **Upsert:** bez `id` (lub bez sensownego UUID) w body → **tworzenie**; z poprawnym `id` → **aktualizacja** jak patch (patrz body). |
| PATCH | `/vehicles/:id` | Aktualizacja pól pojazdu (ten sam kształt body co przy upsert „update”). |
| DELETE | `/vehicles/:id` | **Soft delete:** `isActive: false`. Idempotentnie: drugi delete na już nieaktywnym zwraca sukces z `{ id }`. |
| POST | `/vehicles/:id/photo` | Upload zdjęcia: **multipart**, pole pliku **`file`**. Dozwolone typy: `image/jpeg`, `image/png`, `image/webp`. Limit rozmiaru: **5 MB**; przy przekroczeniu → **400** `file too large (max 5 MB)`. |

## Dostęp do szkoły (własność)

Operacje na liście / pojedynczym pojeździe / zapis wymagają, żeby **`schoolId`** (lista, create) lub pojazd (read, update, delete, photo) należał do **OSK właściciela** (`ownerId` = bieżący użytkownik). W przeciwnym razie często **403 Forbidden** (lub **404**, gdy zasób jest ukryty jako „nie znaleziony” dla nie-właściciela / nieaktywnego pojazdu — patrz implementacja).

## Body: tworzenie (`POST /vehicles` bez `id`)

Wymagane: `name`, `registrationNumber`, `schoolId` (UUID). Opcjonalnie: `inspectionDate`, `insuranceDate` (ISO lub null), `brand`, `model`, `photoUrl` (http/https lub null), `modelYear`, `mileageKm`, `note` — semantyka jak w `parseVehicleWriteBody` w `schemas/vehicle.schemas.ts`.

- **`registrationNumber`**: unikalny **w obrębie danej szkoły**; duplikat → **409** z komunikatem o konflikcie.
- **Pierwszy pojazd** dla danego `schoolId`: w transakcji ustawiane jest `defaultVehicleId` na rekordzie szkoły (jak w [driving-schools-api.md](./driving-schools-api.md)).

## Body: aktualizacja (`POST /vehicles` z `id` lub `PATCH /vehicles/:id`)

Nadal wymagane w body do walidacji: `name`, `registrationNumber` (oraz pozostałe zasady parse). Pola opcjonalne można patchować zgodnie ze schematem. Pojazd nieaktywny → zachowanie jak **404** przy update.

## Zdjęcie (`POST /vehicles/:id/photo`)

Sukces: `data: { photoUrl }` (publiczny URL w Supabase Storage). Bucket: zmienna środowiskowa `SUPABASE_VEHICLE_IMAGES_BUCKET` (domyślnie `vehicle-images`). Brak konfiguracji storage → **500** `Storage is not configured`; błąd uploadu → **502** `Upload failed`.

## Format odpowiedzi

Zgodnie z [api-guidelines.md](./api-guidelines.md): `{ success, data?, error? }`.

Typowe statusy: **400** (walidacja, brak pliku, zły MIME), **401** (brak/nieprawidłowy token), **403**, **404**, **409** (duplikat numeru rejestracyjnego), **500** / **502** (storage).

## Powiązania

- Domyślny pojazd szkoły z poziomu OSK: `PATCH /driving-schools/:id/default-vehicle` — [driving-schools-api.md](./driving-schools-api.md).
- Struktura kodu: [backend-structure.md](./backend-structure.md).
