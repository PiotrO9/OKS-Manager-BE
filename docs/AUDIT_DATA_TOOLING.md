# Przygotowanie danych do audytu

Narzędzie działa wyłącznie na odizolowanej bazie testowej i wymaga konta `ADMIN`.
Nie uruchamiaj go na projekcie DEV używanym równolegle przez inne zadanie.
Przed resetem zapisz wyniki przebiegu audytu i wykonaj kopię danych, jeśli są potrzebne.

## Zakres operacji

`POST /dev/audit/preview` pokazuje stan przed i po planowanym czyszczeniu.
`POST /dev/audit/execute` wykonuje operację potwierdzoną podglądem.

| Operacja | Zachowany stan |
| --- | --- |
| `clear: managers` | Aktywne i nieaktywne konta `ADMIN` i `MANAGER`, ich ustawienia i profile oraz globalne typy kursów; bez OSK i danych operacyjnych |
| `clear: schools` | Powyższe konta, OSK menadżerów i ich ustawienia oraz typy kursów; bez instruktorów, kursantów i danych operacyjnych |
| `clear: instructors` | Powyższe oraz instruktorzy przypisani do zachowanych OSK, ich kwalifikacje i domyślne godziny pracy; bez kursantów, pojazdów, kursów i danych operacyjnych |
| `clear: full` | Wszystkie tabele aplikacji są czyszczone; w tej samej transakcji odtwarzane jest tylko techniczne konto `ADMIN` z ustawieniami i profilem |
| `fixture: manager-only` | Nowy `ADMIN`, menadżer i cztery typy kursów, bez OSK |
| `fixture: school-empty` | Jak wyżej oraz jedno OSK z ustawieniami |
| `fixture: school-staffed` | Jak wyżej oraz dwóch instruktorów z różnymi kwalifikacjami i godzinami pracy |
| `fixture: school-operational` | OSK, dwóch instruktorów, dwóch kursantów, dwa pojazdy oraz kurs praktyczny i teorii; bez zapisów, lekcji i płatności |
| `fixture: booking-ready` | Jak `school-operational`, z aktywnym zapisem kursanta na kurs praktyczny i wskazanym przyszłym terminem w dniu roboczym |
| `fixture: payment-ready` | Jak `school-operational`, z aktywnym zapisem kursanta i planem płatności bez opłaty do utworzenia |
| `fixture: account-ready` | Dwie odrębne OSK z kontami obu ról; w pierwszej konta z aktywnym zapisem/kursem i bez zobowiązań do testu zarządzania kontami |

Zestawy `fixture` **zastępują całą zawartość tabel aplikacji**. `booking-ready`
zwraca `bookableWindow` wyliczone dla strefy `Europe/Warsaw`; dostępność trzeba
potwierdzić w aplikacji na izolowanej bazie. Pozostałe nazwane stany z
`../../FE/OSK-Manager-FE/docs/functional-audit/test-data.md` są na razie specyfikacją; nie mają
jeszcze automatycznej implementacji.

Podgląd podaje liczniki głównych encji. Wynik wykonania podaje stan przed/po,
liczby zachowanych, usuniętych i utworzonych rekordów z tych encji, czas i dla
fixture także wersję oraz identyfikatory logiczne. Liczniki nie
zastępują kontroli wszystkich tabel zależnych.

## Zabezpieczenia

Ustaw na backendzie:

```env
ALLOW_DB_RESET=true
AUDIT_RESET_CONFIRM_SECRET=<losowy sekret co najmniej 32 znaki>
```

`NODE_ENV=production` blokuje narzędzie. Najpierw wywołaj podgląd i odczytaj
`targetFingerprint`. Ustaw `AUDIT_RESET_TARGET_FINGERPRINT` na tę dokładną
wartość, uruchom backend ponownie i wykonaj podgląd jeszcze raz. Przy `full`
oraz każdym `fixture` ustaw dodatkowo `ALLOW_DB_FULL_RESET=true`. Ten odcisk
identyfikuje host, port, użytkownika, nazwę bazy i schemat z `DATABASE_URL`,
bez ujawniania hasła. Zmiana celu po podglądzie unieważnia potwierdzenie.

Po pracy ustaw obie flagi `ALLOW_DB_RESET=false` i `ALLOW_DB_FULL_RESET=false`,
usuń odcisk celu z konfiguracji i uruchom backend ponownie.

## Wywołanie

Przykład podglądu (nagłówek `Authorization: Bearer <token-admina>`):

```http
POST /dev/audit/preview
Content-Type: application/json

{"operation":{"kind":"clear","level":"schools"}}
```

Odpowiedź zawiera `confirmation`, ważne 10 minut. Do wykonania prześlij
identyczną operację i zwróconą wartość:

```http
POST /dev/audit/execute
Content-Type: application/json

{"operation":{"kind":"clear","level":"schools"},"confirmation":"<z podglądu>"}
```

Dla `full` lub `fixture` dodaj `"fullConfirmation":"WIPE AUDIT DATABASE"`.
Przed usunięciem danych backend ponownie liczy podgląd pod blokadą transakcyjną.
Zmiana liczebności lub zakresu zachowanych danych albo równoległy reset daje
konflikt i wymaga nowego podglądu.

Istniejący `POST /dev/reset-and-seed` nadal tworzy duży zestaw demo. Ponieważ
też zastępuje wszystkie tabele aplikacji, wymaga obu flag, zaakceptowanego
odcisku celu i nagłówka `x-audit-full-confirmation: WIPE AUDIT DATABASE`.

## Supabase Auth i pliki

Czyszczenie `clear` nie usuwa użytkowników Supabase Auth. `full` tworzy lub
aktualizuje testowe konto administratora w Auth przed transakcją bazy; fixture
podobnie przygotowuje konta wymagane przez zestaw. Inne konta Auth pozostają.
Operacje Auth nie podlegają rollbackowi transakcji Postgres. Żaden wariant nie
usuwa plików z Supabase Storage (`avatars`, `vehicle-images`). Na dedykowanym
projekcie testowym te zasoby trzeba kontrolować osobno.

Po `full` zaloguj się technicznym kontem administratora skonfigurowanym w
`src/services/devResetSeed/constants.ts`. Poprzednie sesje w tabeli aplikacji są
usunięte; zaloguj się ponownie. Nie zapisuj hasła ani tokenu w dokumentacji
przebiegu.

## Weryfikacja przed użyciem

Uruchom `npm run check` w `BE`. W przebiegu z 2026-10-08 zastosowano wszystkie
migracje do lokalnego Supabase i wykonano sześć presetów oraz cztery poziomy
czyszczenia przez rzeczywiste API, Auth i PostgreSQL. Wynik opisano w
`../../FE/OSK-Manager-FE/docs/functional-audit/runs/2026-10-08-local-integration.md`. Przed każdym
nowym środowiskiem ponownie sprawdź odcisk celu i podgląd operacji. Testy
jednostkowe same nie potwierdzają integralności relacji na rzeczywistym Postgresie.
