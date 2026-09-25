# Walidacja dostępności terminarza

Dokument opisuje backendowy mechanizm podglądu i egzekwowania dostępności
instruktorów, pojazdów, kursantów, wydarzeń oraz lekcji.

## Zasada nadrzędna

Preflight API poprawia UX, ale nie rezerwuje terminu. Każda operacja zapisu
ponownie wykonuje odpowiednie reguły domenowe. Zapisy wrażliwe na równoczesne
zmiany są wykonywane w transakcji `Serializable` z maksymalnie trzema próbami.

## Endpointy

| Metoda i ścieżka                               | Rola               | Zastosowanie                               |
| ---------------------------------------------- | ------------------ | ------------------------------------------ |
| `POST /schedule/availability-options`          | manager            | Lista możliwych godzin i pojazdów dla dnia |
| `POST /schedule/availability-check`            | zależna od intentu | Dokładne sprawdzenie jednego terminu       |
| `POST /events/:id/students/availability-check` | manager            | Sprawdzenie uczestników wydarzenia         |

Endpointy terminarza przyjmują ścisłe unie Zod rozróżniane przez pole
`intent`. Nieznane pola są odrzucane.

## Intenty

| Intent             | Wymagane dane                                  | Główne reguły                                                   |
| ------------------ | ---------------------------------------------- | --------------------------------------------------------------- |
| `event_create`     | instruktor, typ, data i czas                   | godziny pracy, konflikty instruktora, długość, kurs albo pojazd |
| `event_edit`       | event, instruktor, data i czas                 | reguły eventu z wykluczeniem edytowanego rekordu                |
| `lesson_create`    | kurs, kursant, instruktor, pojazd, data i czas | kwalifikacja, grafik kursanta, pakiet, pojazd, okno rezerwacji  |
| `lesson_edit`      | lekcja, instruktor, pojazd, data i czas        | reguły lekcji z wykluczeniem edytowanego rekordu                |
| `lesson_self_book` | kurs, instruktor, data i czas                  | użytkownik-kursant, pakiet, grafik i serwerowy dobór pojazdu    |

`availability-options` obsługuje `event_create`, `event_edit` i `lesson_edit`.

## Kontrakt czasu

API dostępności używa polskiego czasu ściennego:

```json
{
	"date": "2026-09-25",
	"startTime": "10:00",
	"endTime": "11:00"
}
```

Strefa domenowa to zawsze `Europe/Warsaw`. Moduł
`src/lib/polishScheduleTime.ts`:

- odrzuca błędne i niejednoznaczne lokalne daty,
- zamienia polskie wartości na instants używane w bazie,
- wyznacza granice polskiego dnia,
- zamienia instants z bazy na polską datę i godzinę.

Nie należy dopisywać `Z` do lokalnej godziny ani opierać logiki na strefie
procesu Node.js.

## Odpowiedź dokładnego sprawdzenia

```json
{
	"available": false,
	"issues": [
		{
			"code": "VEHICLE_BUSY",
			"field": "vehicleId"
		}
	],
	"policy": {
		"minDurationMinutes": 60,
		"maxDurationMinutes": 120
	}
}
```

Kody problemów są stabilnym kontraktem dla klienta:

- czas: `DURATION_TOO_SHORT`, `DURATION_TOO_LONG`, `DATE_NOT_BOOKABLE`,
- instruktor: `INSTRUCTOR_BUSY`, `OUTSIDE_INSTRUCTOR_HOURS`,
  `INSTRUCTOR_NOT_ELIGIBLE`,
- pojazd: `VEHICLE_UNAVAILABLE`, `VEHICLE_BUSY`, `NO_VEHICLE_AVAILABLE`,
- kursant: `STUDENT_BUSY`, `STUDENT_NOT_ELIGIBLE`, `PARTICIPANT_BUSY`,
- kurs: `COURSE_LIMIT_EXCEEDED`, `COURSE_NOT_ELIGIBLE`.

Pole `field` wskazuje kontrolkę, przy której frontend powinien pokazać błąd.

## Odpowiedź z opcjami

```json
{
	"stepMinutes": 15,
	"options": [
		{
			"startTime": "10:00",
			"endTimes": ["11:00", "11:15", "11:30"]
		}
	],
	"availableVehicleIds": ["vehicle-uuid"],
	"policy": {
		"minDurationMinutes": 60,
		"maxDurationMinutes": 120
	}
}
```

`availableVehicleIds` jest zwracane dla przepływów wymagających pojazdu. Pojazd
jest uwzględniany, jeżeli ma co najmniej jeden poprawny termin danego dnia.

## Polityka długości

Limity są pobierane z `SchoolSettings`:

- praktyka: `practiceMinDurationMinutes` i `practiceMaxDurationMinutes`,
- teoria: `theoryMinDurationMinutes` i `theoryMaxDurationMinutes`,
- krok początku: 60 minut, gdy `slotMustStartFullHour` jest aktywne; w
  przeciwnym razie domyślny krok opcji.

Podgląd i zapis korzystają z tej samej polityki. Brak ustawień ma bezpieczne
wartości domyślne zdefiniowane w `schedule-validation/policy.ts`.

## Struktura serwisów

| Moduł                                   | Odpowiedzialność                                   |
| --------------------------------------- | -------------------------------------------------- |
| `schedule-validation/check.ts`          | Orkiestracja dokładnego preflightu według intentu  |
| `schedule-validation/options.ts`        | Orkiestracja opcji dla całego dnia                 |
| `schedule-validation/optionsMatrix.ts`  | Budowanie par początek-koniec z okien czasu        |
| `schedule-validation/policy.ts`         | Limity czasu i krok rozpoczęcia                    |
| `schedule-validation/conflicts.ts`      | Odejmowanie konfliktów jednego lub wielu kursantów |
| `schedule-validation/vehicleWindows.ts` | Aktywne pojazdy i ich wolne okna                   |
| `schedule-validation/transaction.ts`    | Transakcja `Serializable` i retry konfliktów       |

Reguły szczegółowe pozostają w serwisach domenowych lekcji, wydarzeń,
dostępności instruktora i pojazdów. Warstwa schedule-validation je składa, ale
nie tworzy konkurencyjnej implementacji.

## Edycja i self-exclusion

Przy edycji `eventId` lub `lessonId` jest wykluczany z wyszukiwania konfliktów.
Dzięki temu zapis nie koliduje sam ze sobą, a pozostawienie obecnych wartości
jest poprawnym no-opem. Wykluczenie dotyczy instruktora, pojazdu, kursantów i
okien generowanych dla pickera.

## Uczestnicy wydarzenia

Preflight uczestników korzysta z docelowej listy użytkowników i opcjonalnego
nowego czasu wydarzenia. Te same reguły są używane przez zapis listy
uczestników. Sprawdzane są między innymi konflikty kursantów, kwalifikacja i
pojemność wydarzenia.

## Współbieżność

Preflight nie daje gwarancji, że termin pozostanie wolny. Zapis musi:

1. rozpocząć transakcję `Serializable`,
2. ponownie sprawdzić konflikty w tej samej transakcji,
3. wykonać zapis,
4. ponowić operację maksymalnie trzy razy dla błędu Prisma `P2034`,
5. zwrócić `409`, jeżeli konflikt serializacji nadal występuje.

## Wydajność

- Niezależne odczyty polityki, okien dnia, kwalifikacji i pojazdów są
  równoleglone przez `Promise.all`.
- Polityka długości i `slotMustStartFullHour` są pobierane jednym zapytaniem.
- Konflikty uczestników korzystają ze wspólnej funkcji dla jednego lub wielu
  kursantów.
- Dostępność pojazdów jest grupowana i przeliczana na okna bez osobnego
  requestu HTTP dla każdego pojazdu.
- Migracja `20260925120000_schedule_availability_lookup_indexes` dodaje indeksy
  dla wyszukiwania bloków czasu instruktora i urlopów.

Nowe reguły należy projektować zbiorczo. Pętla wykonująca zapytanie Prisma dla
każdego pojazdu, kursanta lub slotu wymaga uzasadnienia i testu wydajności.

## Dodawanie intentu lub reguły

1. Rozszerz ścisły schemat Zod w `schedule.schemas.ts`.
2. Dodaj typ problemu tylko wtedy, gdy klient potrafi podjąć inną akcję.
3. Użyj istniejącej reguły domenowej albo wydziel ją ze ścieżki zapisu.
4. Dodaj obsługę w `check.ts`; opcje dnia dodaj tylko, jeśli formularz ich
   potrzebuje.
5. Uruchom tę samą regułę we właściwej operacji zapisu.
6. Obsłuż self-exclusion dla edycji.
7. Zaktualizuj OpenAPI i frontendowe typy.
8. Dodaj testy jednostkowe, kontraktowe oraz integracyjne dla wyścigu zapisów.

## Testy

Najważniejsze zestawy:

- `schedule-availability-check.test.ts`,
- `schedule-availability-options.test.ts`,
- `schedule-duration-policy.test.ts`,
- `schedule-write-transaction.test.ts`,
- `event-schedule-conflicts.test.ts`,
- testy integracyjne w `src/__tests__/integration`.

Komendy:

```bash
npm run test
npm run test:integration
npm run typecheck
npm run build
```

Testy integracyjne wymagają osobnej testowej bazy PostgreSQL zgodnie z
konfiguracją runnera. Nie wolno uruchamiać ich na współdzielonej bazie DEV ani
PROD.
