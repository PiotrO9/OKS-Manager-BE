# One School Membership

Data decyzji: 2026-09-11

## Decyzja

Kursant i instruktor moga miec tylko jedno aktywne przypisanie do OSK.

Ta zasada dotyczy relacji:

- `student_schools.student_id`
- `instructor_schools.instructor_id`

W bazie wymuszaja to unikalne indeksy dodane w migracji:

```text
20260911120000_single_school_memberships_and_event_school
```

## Powod

W aplikacji szczegoly kursanta i instruktora nie powinny wymagac `schoolId` w
adresie URL. Profil osoby jest jednoznaczny, a kontekst OSK jest wyznaczany z
jej aktywnego przypisania.

Dzieki temu prostsze sa:

- adresy szczegolow,
- autoryzacja dostepu do profilu,
- harmonogram instruktora,
- eventy instruktora,
- widoki zalezne od profilu osoby.

## Konsekwencje

Adresy szczegolow sa kanoniczne bez `schoolId`, np.:

```text
/manager/students/:userId
/manager/instructors/:id
```

Stare linki z `?schoolId=...` moga byc obslugiwane przejsciowo, ale frontend
powinien je czyscic przez `router.replace`.

`schoolId` nadal jest poprawnym i potrzebnym kontekstem w miejscach, gdzie
uzytkownik pracuje na zasobach OSK, np. listy, kursy, pojazdy, platnosci,
opinie, proces kursanta i inne widoki zalezne od wybranej szkoly.

## Przeniesienie instruktora

Docelowym endpointem do zmiany OSK instruktora jest:

```text
PUT /instructors/:id/school
```

Endpoint legacy pozostaje przejsciowo dla kompatybilnosci:

```text
POST /instructors/:id/schools
```

Zmiana OSK instruktora powinna byc blokowana, jezeli instruktor ma w obecnym
OSK przyszle jazdy, przyszle eventy, aktywne kursy albo przyszle bloki czasu.
Najpierw trzeba uporzadkowac te dane, dopiero potem zmienic przypisanie.

## Migracja danych

Migracja nie scala automatycznie wielu przypisan. Jezeli w istniejacej bazie
sa kursanci lub instruktorzy przypisani do wielu OSK, migracja przerwie sie na
preflight checku.

Przed deployem na PROD trzeba uruchomic migracje na kopii lub stagingu i
recznie zdecydowac, ktore przypisanie zostaje aktywne dla kazdej osoby z
duplikatem.
