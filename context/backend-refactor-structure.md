---
description: "Backend refactor structure: small domain modules and compatibility re-export files"
alwaysApply: true
---

# Backend refactor structure

Ten dokument opisuje obecny wzorzec porzadkowania backendu po refactorach.
Cel: mniejsze pliki, stabilne importy i brak zmian w kontraktach API.

## Zasada ogolna

Gdy duzy plik miesza kilka odpowiedzialnosci, rozbij go na mniejsze moduly w
tym samym katalogu, ale zostaw stary plik jako fasade:

```ts
export * from './moduleA';
export * from './moduleB';
```

Dzieki temu kontrolery, serwisy, Swagger i testy moga nadal importowac ze
starej sciezki, a nowy kod moze juz korzystac z bardziej precyzyjnych modulow.

## Schemas

W `src/schemas` preferuj podzial wedlug roli requestu:

- `*Read.schemas.ts` albo `*Queries.schemas.ts` - query params, params, statusy
  i proste schematy odczytu.
- `*Write.schemas.ts` - create, patch, bulk update i parsery body.
- `*Participants.schemas.ts`, `*Action.schemas.ts`, `*CourseFields.schemas.ts`
  itp. - gdy domena ma wyrazny podobszar.
- `*.schemas.ts` - plik kompatybilnosciowy, ktory re-eksportuje rozbite moduly.

Przyklady:

- `event.schemas.ts` re-eksportuje `eventWrite.schemas.ts`,
  `eventParticipants.schemas.ts` i `eventQueries.schemas.ts`.
- `vehicle.schemas.ts` re-eksportuje `vehicleRead.schemas.ts` i
  `vehicleWrite.schemas.ts`.
- `driving-school.schemas.ts` re-eksportuje moduly akcji, pol kursow i write
  body.

## Services

W `src/services/<domain>` trzymaj male moduly wedlug odpowiedzialnosci:

- `access.ts` - sprawdzanie dostepu, ownership, role i guardy domenowe.
- `queries.ts` - odczyty Prisma.
- `commands.ts` - operacje zmieniajace stan.
- `mappers.ts` - mapowanie modeli Prisma na odpowiedzi API.
- `types.ts` - lokalne typy domenowe.
- `implementation.ts` albo stary `*.service.ts` - cienka fasada/kompozycja.

Nie przenos logiki biznesowej do kontrolera tylko po to, aby zmniejszyc serwis.

## Controllers

Kontroler powinien byc cienki:

1. `requireUser` / role middleware.
2. Walidacja `params`, `query`, `body`.
3. Wywolanie serwisu.
4. `sendJsonSuccess`.

Dla powtarzalnego parsowania uzywaj `src/controllers/requestParsing.ts`.

## Validation

Wspolne walidatory trzymamy w `src/lib/validation`.

- `uuid.ts` zostaje publiczna fasada.
- `uuidCore.ts` - podstawowy regex, schema i parsery UUID.
- `uuidParams.ts` - generyczne params/body schema dla UUID.
- domenowe schema, np. `studentSchemas.ts`, moga mieszkac obok, jezeli sa
  uzywane przez kilka warstw.

## Verification

Po kazdym takim refactorze uruchom:

```bash
npm run build
npx eslint -- <changed ts files>
npm run test
git diff --check
```

Ostrzezenia Git o przyszlej zmianie LF/CRLF nie oznaczaja same w sobie bledu.
