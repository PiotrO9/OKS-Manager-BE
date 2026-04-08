---
description: "API — kursy (/courses): lista, szczegóły, utworzenie, PATCH instruktora, role, identyfikatory instruktora"
alwaysApply: true
---

# Kursy — API

Montowanie w `src/server.ts` pod prefiksem **`/courses`**.

Implementacja: `src/routes/courses.routes.ts`, `src/controllers/courses.controller.ts`, `src/services/course.service.ts`, schematy body: `src/schemas/course.schemas.ts`.

## Model domenowy (skrót)

- Kurs (`Course`) należy do jednej szkoły (`schoolId`), może mieć **co najwyżej jednego** przypisanego instruktora (`instructorId` → `InstructorProfile.id`, opcjonalne).
- Rodzaj kursu (`kind`): `THEORY_GROUP`, `PRACTICAL`, `EXTRA` (enum Prisma `CourseKind`).
- Lista i tworzenie wymagają szkoły, do której użytkownik jest **właścicielem** (`DrivingSchool.ownerId`). Szczegóły i PATCH sprawdzają właściciela szkoły przypiętej do kursu.
- Dozwolone wartości `kind` przy **tworzeniu** kursu muszą być zawarte w `SchoolSettings.enabledCourseKinds` danej szkoły (zob. [driving-schools-api.md](./driving-schools-api.md)). Dopóki nie ma rekordu `school_settings` lub lista kinds jest pusta, `POST /courses` zwraca **400**. Wyłączenie typu w ustawieniach OSK **nie** zmienia istniejących kursów — blokuje tylko nowe `POST /courses` z tym `kind`.
- Kategoria w polu **`category`** to nadal dowolny string w API; lista **`offeredCourseTypes`** w ustawieniach OSK służy pod przyszłą walidację / front (np. select); pełna spójność z `CourseType` przy `POST /courses` może być dodana później (`courseTypeId`).

## Uwierzytelnianie i autoryzacja

- Nagłówek **`Authorization: Bearer <access_token>`** (jak przy `GET /auth/me`).
- Wszystkie trasy: **`authMiddleware`** + **`requireMinRole('MANAGER')`** (MANAGER lub ADMIN; STUDENT / INSTRUCTOR nie przechodzą).

Szczegóły sesji: [auth.md](./auth.md).

## Identyfikator instruktora (ważne dla frontu)

- W **bazie** i w polu **`instructorId`** przy **POST** (odpowiedź create) oraz w body **PATCH** chodzi o **`InstructorProfile.id`** (UUID profilu instruktora).
- W polu **`instructor.id`** w odpowiedziach **GET** listy i **GET** szczegółów oraz po **PATCH** zwracane jest **`User.id`** (konto użytkownika), wraz ze złożonym **`name`** (imię i nazwisko).
- Przy przypisywaniu instruktora należy używać tego samego identyfikatora co przy tworzeniu kursu z `instructorId` (profil), albo pobierać mapowanie z backendu / panelu OSK — nie mylić z `instructor.id` z GET bez sprawdzenia.

## Trasy

| Metoda | Ścieżka | Opis |
|--------|---------|------|
| GET | `/courses?schoolId=<uuid>` | Lista kursów danej szkoły (tylko `deletedAt` null). Dostęp: **właściciel** szkoły o podanym `schoolId`; inaczej **403**. Sort: `createdAt` malejąco. |
| GET | `/courses/:id` | Szczegóły kursu (jak poniżej). Dostęp: **właściciel** szkoły kursu; brak kursu / soft-delete → **404**; obcy właściciel → **403**. |
| POST | `/courses` | Utworzenie kursu w szkole (body poniżej). Właściciel `schoolId` z body. |
| PATCH | `/courses/:id` | Częściowa aktualizacja: wyłącznie **`instructorId`** (przypisanie, zmiana lub usunięcie). Patrz sekcja PATCH. |

## GET lista — query

| Parametr | Wymagane | Opis |
|----------|-----------|------|
| `schoolId` | tak | UUID szkoły (walidacja jak w `schoolIdQuerySchema`) |

## POST — body (JSON)

| Pole | Typ | Uwagi |
|------|-----|--------|
| `schoolId` | string (UUID) | Szkoła musi istnieć i mieć `ownerId` = bieżący użytkownik |
| `name` | string | Po trim niepusty |
| `category` | string | Po trim niepusty |
| `kind` | `THEORY_GROUP` \| `PRACTICAL` \| `EXTRA` | Musi być w `enabledCourseKinds` szkoły (patrz ustawienia OSK); inaczej **400** |
| `totalHours` | number | Liczba całkowita dodatnia (minimum 1) |
| `capacity` | number \| null \| omit | Dozwolone tylko dla `THEORY_GROUP`; dla `PRACTICAL` / `EXTRA` nie może być podane |
| `instructorId` | string (UUID) \| null \| omit | Jeśli podane i nie null: musi istnieć powiązanie `InstructorSchool` dla tego profilu i `schoolId` (**400** `instructor does not belong to this school`) |
| `theoryStartDate`, `theoryEndDate` | date \| null | Dla `THEORY_GROUP` **wymagane** oba; koniec ≥ początek. Dla innych `kind` nie mogą być ustawione |

Zapis: dla `PRACTICAL` / `EXTRA` pole `capacity` w DB jest **null**; daty teorii **null** jeśli nie THEORY_GROUP z kompletem dat.

## POST — odpowiedź (200)

`data`: obiekt utworzonego kursu płaski DTO: `id`, `name`, `category`, `kind`, `totalHours`, `capacity`, `theoryStartDate`, `theoryEndDate`, `schoolId`, **`instructorId`** (profil lub null), `status`, `createdAt`.

## GET lista — odpowiedź (200)

`data.courses`: tablica elementów: `id`, `name`, `category`, `type` (to samo co `kind`), `totalHours`, `instructor`: `{ id: User.id, name }` lub `null`.

## GET szczegółów — odpowiedź (200)

`data.course`: `id`, `name`, `category`, `type`, `totalHours`, `capacity`, `instructor`: `{ id: User.id, name }` lub `null`.

## PATCH — body (JSON)

Tylko pole **`instructorId`** ma znaczenie; inne klucze są odrzucone przez Zod (brak `.strict()` — nadmiarowe pola zwykle ignorowane).

| Body | Zachowanie |
|------|------------|
| `{}` lub brak klucza `instructorId` | **Brak zapisu** do DB; odpowiedź jak GET szczegółów (**200**). |
| `{ "instructorId": null }` | Usunięcie przypisania (`instructorId` = null). |
| `{ "instructorId": "<uuid>" }` | Ustawienie instruktora po sprawdzeniu powiązania z szkołą kursu (`InstructorSchool`). |

**Właściciel:** tylko `ownerId` szkoły przypiętej do kursu; inaczej **403**. Kurs nieistniejący / `deletedAt` ustawione → **404**. Instruktor niepowiązany z tą OSK → **400** (ten sam komunikat co przy POST).

## PATCH — odpowiedź (200)

`data.course`: ten sam kształt co **GET `/courses/:id`** (`CourseDetailDto`).

## Kody błędów (zbiorczo)

| Kod | Sytuacja |
|-----|----------|
| **401** | Brak / niepoprawny JWT |
| **403** | Rola poniżej MANAGER; użytkownik nie jest właścicielem szkoły przy liście/tworzeniu; nie jest właścicielem szkoły kursu przy GET / PATCH |
| **400** | Niepoprawny `schoolId` lub `:id`; walidacja POST/PATCH (np. zasady `kind` / dat / capacity; nieprawidłowy UUID `instructorId`; instruktor spoza szkoły); **POST:** brak rekordu `school_settings` (`School settings not configured`); pusta lista `enabledCourseKinds` (`No course kinds enabled for this school`); `kind` spoza listy (`Course kind is not enabled for this school`) |
| **404** | GET/PATCH: kurs nie znaleziony lub „usunięty” (`deletedAt`) |

## Checklist smoke (ręczna)

1. **GET lista:** poprawny `schoolId` właściciela → **200**, tylko kursy z `deletedAt` null.
2. **GET lista:** cudzy `schoolId` → **403**.
3. **POST:** THEORY_GROUP bez dat → **400**; PRACTICAL z `capacity` → **400**.
4. **POST:** `instructorId` z innej OSK → **400**.
5. **GET/PATCH:** cudzy kurs → **403**; nieistniejący `:id` → **404**.
6. **PATCH `{}`** → **200**, bez zmiany `instructorId` w DB.
7. **PATCH** `instructorId: null` → **200**, pole null w DB.
8. **POST:** `kind` niewłączony w `enabledCourseKinds` szkoły lub pusta lista typów w ustawieniach → **400**.
