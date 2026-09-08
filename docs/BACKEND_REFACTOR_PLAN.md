# Backend Refactor Plan

Data startu: 2026-09-07
Branch roboczy: `refactor/be-plan-and-baseline`

## Cel

Poprawic jakosc backendu OSK Manager bez zmiany publicznego kontraktu HTTP.
Praca obejmuje checks, typecheck, formatowanie, testy charakterystyki,
modularnosc serwisow i higiene logowania.

Najwazniejsza zasada: route'y i kontrolery sa kontraktem publicznym. Refactor
ma isc pod spodem: services, mappers, validators, helpers, tests.

## Zakazy

Bez osobnej decyzji nie wolno zmieniac:

- sciezek endpointow,
- metod HTTP,
- nazw parametrow route/query/body,
- response shape,
- kodow statusu,
- zasad auth i minimalnych rol,
- Prisma schema i migracji,
- globalnej architektury backendu.

## Aktualny kontekst

Backend jest osobnym repo/worktree w `BE`. Git dziala z katalogu `BE`, a nie z
rootu `D:\CODE\OSK-Manager`.

Aktualny branch: `refactor/be-plan-and-baseline`.

Istniejace wzorce:

- Express + TypeScript + Prisma.
- Routery w `src/routes`.
- Cienkie kontrolery w `src/controllers`.
- Logika domenowa w `src/services`.
- Zod schemas w `src/schemas`.
- Globalne bledy przez `AppError` i `errorRequestHandler`.
- Odpowiedzi JSON przez koperte `{ success, data? }` albo `{ success, error }`.
- W refactorach preferowany jest podzial plikow z kompatybilnosciowym
  re-exportem/fasada.

Najwieksze pliki do pozniejszego audytu:

- `src/services/manager-attention/implementation.ts`
- `src/services/students/payments.ts`
- `src/services/devResetSeed/operationalData.ts`
- `src/controllers/students/implementation.ts`

## Strategia Git

Kazdy etap powinien miec maly zakres i osobny branch wychodzacy z `develop`.
Ten etap planu i baseline'u jest prowadzony na `refactor/be-plan-and-baseline`.

Rekomendowana kolejnosc branchy:

```text
develop
  refactor/be-plan-and-baseline
  refactor/be-checks-toolchain
  refactor/be-typecheck-tests
  refactor/be-format
  refactor/be-characterization-tests
  refactor/be-manager-attention
  refactor/be-student-payments
  refactor/be-logger
```

Formatowanie ma byc osobnym commitem/branchem. Nie mieszac formatowania z
logika.

## Podzial pracy

Agent glowny:

- pilnuje branchy i integracji,
- sprawdza diff pod katem zmian kontraktu,
- uruchamia finalne checks,
- aktualizuje ten plan,
- scala tylko male, zweryfikowane zakresy.

Strumien 1: endpoint baseline

- utrzymuje `BE/docs/BACKEND_ENDPOINT_BASELINE.md`,
- porownuje routery z baseline'em po wiekszych zmianach,
- wskazuje rozjazdy miedzy routerami i OpenAPI.

Strumien 2: checks/toolchain

- utrzymuje skrypty jakosci w `package.json`,
- uruchamia lint, format check, typecheck, testy i build,
- nie zmienia logiki domenowej.

Strumien 3: typecheck testow

- naprawia bledy TypeScript w testach,
- nie uzywa `any`, `@ts-ignore`, przypadkowych suppressions ani wylaczen
  ESLinta,
- nie oslabia configu tylko po to, zeby check byl zielony.

Strumien 4: modularity audit

- analizuje najwieksze pliki,
- proponuje realne granice podzialu,
- wskazuje testy charakterystyki wymagane przed refactorem,
- nie implementuje duzych zmian w ramach samego audytu.

## Etapy

### Stage 0 - plan backendu

- [x] Utworzyc `BE/docs/BACKEND_REFACTOR_PLAN.md`.
- [x] Spisac ograniczenia kontraktu API.
- [x] Spisac sposob pracy i podzial strumieni.

### Stage 1 - endpoint baseline

- [x] Utworzyc `BE/docs/BACKEND_ENDPOINT_BASELINE.md`.
- [x] Zbudowac baseline z `src/server.ts` i `src/routes/*.routes.ts`.
- [ ] Zweryfikowac rozjazdy miedzy routerami i OpenAPI.
- [ ] Dodac automatyczny check porownujacy aktualne trasy z baseline'em.

### Stage 2 - checks/toolchain

- [x] Dodac brakujace skrypty `format:check`, `typecheck`,
      `typecheck:build`, `check`.
- [x] Uruchomic `npm run lint`.
- [x] Uruchomic `npm run format:check`.
- [x] Uruchomic `npm run typecheck`.
- [x] Uruchomic `npm run typecheck:build`.
- [x] Uruchomic `npm run test`.
- [x] Uruchomic `npm run build`.
- [x] Zapisac wyniki w tym planie.

Wyniki z 2026-09-07:

| Check                     | Wynik | Uwagi                                                                                              |
| ------------------------- | ----- | -------------------------------------------------------------------------------------------------- |
| `npm run lint`            | PASS  | ESLint przechodzi.                                                                                 |
| `npm run format:check`    | FAIL  | Prettier wskazuje 63 pliki w `src/**/*.ts`. Formatowanie wymaga osobnego Stage 4.                  |
| `npm run typecheck`       | FAIL  | 5 bledow TypeScript w testach: `auth-me.test.ts` oraz `instructor-qualified-course-types.test.ts`. |
| `npm run typecheck:build` | PASS  | Produkcyjny typecheck przez `tsconfig.build.json` przechodzi.                                      |
| `npm run test`            | PASS  | 24 pliki testowe, 168 testow.                                                                      |
| `npm run build`           | PASS  | Build produkcyjny przechodzi.                                                                      |
| `npm run check`           | FAIL  | Skrypt dziala, ale zatrzymuje sie na `format:check` przed kolejnymi etapami.                       |

### Stage 3 - TypeScript w testach

- [x] Naprawic bledy `npm run typecheck` bez oslabiania konfiguracji.
- [x] Zachowac produkcyjny build na zielono.

### Stage 4 - formatowanie backendu

- [x] Uruchomic Prettier na osobnym branchu.
- [x] Sprawdzic, ze diff w `src` zawiera tylko formatowanie.
- [x] Uruchomic `npm run format:check`.
- [x] Uzgodnic ESLint z Prettierem przez `eslint-config-prettier`.

### Stage 5 - testy charakterystyki

- [ ] Auth.
- [ ] Courses.
- [ ] Students.
- [ ] Instructors.
- [ ] Vehicles.
- [ ] Events.
- [ ] Payments.
- [ ] Dev reset/seed.

### Stage 6 - modularnosc

- [ ] Rozbic `manager-attention` wedlug realnych odpowiedzialnosci.
- [ ] Rozbic `students/payments` na queries, commands, mappers, rules.
- [ ] Odchudzic duze kontrolery bez zmiany kontraktu HTTP.
- [ ] Utrzymac stare importy przez fasady/re-exporty tam, gdzie to zmniejsza
      ryzyko.

### Stage 7 - logger

- [ ] Wprowadzic jeden adapter loggera.
- [ ] Dodac request/correlation ID.
- [ ] Zredagowac tokeny, cookies, hasla i dane wrazliwe.
- [ ] Ograniczyc przypadkowe `console.*`.

### Stage 8 - koncowy audyt

- [ ] Porownac endpointy z baseline'em.
- [ ] Uruchomic pelny `npm run check`.
- [ ] Sprawdzic `any`, `@ts-ignore`, `eslint-disable`.
- [ ] Sprawdzic najwieksze pliki po refactorze.

## Definition of Done

Etap jest zakonczony dopiero gdy:

- endpoint paths nie zmienily sie przypadkowo,
- metody HTTP nie zmienily sie przypadkowo,
- request/response shape nie zmienil sie przypadkowo,
- status codes nie zmienily sie przypadkowo,
- auth middleware i minimalne role nie zmienily sie przypadkowo,
- dostepne checks zostaly uruchomione albo jawnie oznaczone jako blokowane,
- diff zostal sprawdzony pod katem kontraktu API,
- zmiany sa male i opisane.

## Kontrola kontraktu po zmianach

Po zmianach w trasach, kontrolerach, schematach lub Swaggerze uruchomic:

```powershell
git diff -- src/routes src/controllers src/schemas src/swagger
```

Sprawdzic:

- route path,
- HTTP method,
- middleware auth,
- minimalna rola,
- request body/query/params,
- response body,
- status code.

Jesli zmiana kontraktu jest potrzebna, wydzielic ja poza refactor i opisac jako
decyzje produktowo-architektoniczna.
