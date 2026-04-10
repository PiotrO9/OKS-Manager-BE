---
name: sync-docs
description: >-
  Uzupełnia pliki w context/ z git diff (working tree / staged) dla backendu OSK
  Manager. Use when the user says sync docs, skill sync-docs, zaktualizuj docs,
  dopisz dokumentację, udokumentuj diff, context z gita, or asks to update
  markdown docs from uncommitted code changes. Preferuje zwięzłe edycje w
  stylu istniejących plików context/.
---

# `sync-docs` — dokumentacja z diffu → `context/`

## Cel

Na podstawie **rzeczywistych zmian w kodzie** (working tree i opcjonalnie stage) uzupełnij lub popraw pliki markdown w `context/`, tak aby odzwierciedlały aktualne zachowanie API, auth, schematu bazy i reguł biznesowych — **bez zgadywania** tego, czego nie widać w diffie.

## Język i styl

- Pisz **po polsku**, tak jak istniejące pliki w `context/` (nagłówki, tabele, listy).
- Zachowaj konwencje projektu (np. ścieżki plików w `` `backticks` ``, trasy jako `` `/resource` ``).
- **Nie rozdmuchuj** dokumentacji: tylko to, co wynika ze zmian; unikaj powtórzeń z innych plików — w razie potrzeby dodaj krzyżowy odnośnik `[plik.md](./plik.md)`.

## Bezpieczeństwo i prywatność

- **Nigdy** nie kopiuj do `context/` sekretów, tokenów, connection stringów, kluczy API ani danych osobowych z diffu.
- Ogólne nazwy zmiennych środowiskowych można wymienić **bez wartości**.

## Krok 1 — Zbierz zakres zmian

1. Działaj z katalogu głównego backendu (`BE`), chyba że użytkownik wskaże inaczej.
2. Uruchom (read-only):
   - `git status -sb`
   - `git diff` (unstaged)
   - `git diff --cached` (staged), jeśli użytkownik pracuje ze stage lub o to prosi
3. Jeśli **brak zmian**, poinformuj użytkownika i zapytaj czy uwzględnić konkretny zakres (np. ostatni commit: `git show`).

## Krok 2 — Mapowanie: gdzie aktualizować

Dla każdej ścieżki z diffu wybierz **jeden lub więcej** plików docelowych. Priorytet: najbardziej wyspecjalizowany plik domenowy.

| Obszar w repo | Plik(i) w `context/` |
|---------------|----------------------|
| `src/routes/auth.routes.ts`, `src/controllers/auth*.ts`, middleware sesji/JWT związane z `/auth` | `auth.md` |
| `src/routes/students.routes.ts` i powiązane kontrolery/serwisy | `students-api.md` |
| `src/routes/instructors.routes.ts` | `instructors-api.md` |
| `src/routes/driving-schools.routes.ts` | `driving-schools-api.md` |
| `src/routes/vehicles.routes.ts` | `vehicles-api.md` |
| `src/routes/courses.routes.ts`, `src/routes/course-types.routes.ts` | `courses-api.md` (lub krzyżowo, jeśli dokumentacja jest podzielona tematycznie) |
| `prisma/schema.prisma`, `prisma/migrations/`, ograniczenia DB | `database.md`, `db-constraints.md`; przy dużych zmianach modelu rozważ dopisek o konieczności aktualizacji `database-schema.dbml` (generacja ręczna / osobny krok) |
| Warstwa usług, logika domenowa, encje | `domain.md`, `business-rules.md` (wg sensu zmiany) |
| `src/server.ts`, mounting routerów, globalne middleware | `backend-structure.md`, ewent. `system-overview.md` |
| Walidacja requestów, kontrakty błędów, paginacja, konwencje odpowiedzi | `api-guidelines.md` |
| Konwencje nazw pól, UUID, enumy w kodzie | `naming-conventions.md` |
| Ogólne zasady backendu, walidacja reguł | `backend-rules.md` |
| Nowe moduły / nietypowa struktura katalogów | `backend-structure.md` |
| Zasady dla agenta AI, focus projektu (jeśli zmieniasz filozofię pracy) | `ai-instructions.md` |

Jeśli zmiana dotyka **wielu domen**, zaktualizuj **wszystkie** dotknięte pliki; nie upychaj wszystkiego do jednego.

## Krok 3 — Co dokładnie uzupełniać

Z diffu wyciągnij informacje, które programiści muszą znaleźć w `context/`:

- Nowe lub zmienione **endpointy** (metoda, ścieżka, query, body, kody odpowiedzi).
- Zmiany w **auth** (cookies, nagłówki, wymagane middleware).
- Zmiany **modelu Prisma** → tabele, relacje, unikalność, cascade, indeksy (w `database.md` / `db-constraints.md` wg podziału tematów w istniejących plikach).
- Nowe **reguły biznesowe** lub wyjątki — jasna enumeracja w `business-rules.md` lub `domain.md`.
- Breaking changes: oznacz wyraźnie (np. sekcja „Breaking” lub krótka notka).

**Nie** dopisuj szczegółów implementacji, które nie zmieniają kontraktu zewnętrznego, chyba że istniejący styl danego pliku to wymaga (np. opis przepływu w `auth.md`).

## Krok 4 — Spójność i jakość

- Przed edycją **przeczytaj** aktualną treść docelowego pliku `context/*.md` i dopasuj strukturę nagłówków.
- Po edycji: krótkie **podsumowanie dla użytkownika** (które pliki, co dodano/zmieniono).
- Jeśli z diffu **nie da się** jednoznacznie opisać zachowania (np. brak fragmentu logiki), **zadaj jedno konkretne pytanie** zamiast wymyślać.

## Wywołanie w czacie

Najkrócej: **`sync docs`** albo **`skill sync-docs`**. Działają też: *zaktualizuj docs*, *docs z diffu*, *dopisz context*.
