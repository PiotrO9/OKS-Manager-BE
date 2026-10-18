# Kategorie pojazdów — wdrożenie

## Zakres

Migracja `20261018180000_vehicle_supported_course_types` dodaje pustą relację wiele-do-wielu. Nie przypisuje kategorii na podstawie nazwy, modelu ani historii pojazdu. Nowa wersja aplikacji od razu wymaga zgodności kategorii podczas nowych i zmienianych rezerwacji kursowych. Nie ma przełącznika pomijającego walidację.

## Kolejność wdrożenia

**Etap A — dane, przy dotychczasowej wersji aplikacji**

1. Przygotować backup i sprawdzić adres docelowej bazy. Uruchomić migracje zgodnie z istniejącą procedurą Prisma. W środowisku testowym migracja została sprawdzona od zera.
2. Z katalogu BE uruchomić audyt osobno dla każdej szkoły. Skrypt korzysta z DATABASE_URL środowiska lub lokalnego .env. Raport zawiera katalog kategorii, pojazdy oraz niezgodne przyszłe/trwające jazdy.
3. Osoba znająca flotę potwierdza konkretne przypisania vehicleId → supportedCourseTypeIds. Każda aktywna pozycja floty ma być sklasyfikowana; nie wymyślać przypisań, aby usunąć alarm.
4. Uruchomić próbę z mapowaniem; sprawdzić prognozowane `ready`, `unclassifiedVehicleIds`, `futureConflicts`. Braki lub błędne zajęcia poprawić przed etapem B.
5. Zastosować potwierdzone mapowanie przez --apply. Operacja wyłącznie dodaje przypisania, jest idempotentna i waliduje cały plik przed zapisem w jednej transakcji. Nie usuwa kategorii, pojazdów ani zajęć.

```powershell
# Katalog BE, DATABASE_URL ustawione na wybrane środowisko.
node scripts/vehicle-categories.mjs --school <UUID-szkoły>
node scripts/vehicle-categories.mjs --school <UUID-szkoły> --mapping mapping.json
node scripts/vehicle-categories.mjs --school <UUID-szkoły> --mapping mapping.json --apply
node scripts/vehicle-categories.mjs --school <UUID-szkoły>
```

Format pliku:

```json
[
  {
    "vehicleId": "<UUID-istniejącego-pojazdu>",
    "supportedCourseTypeIds": ["<UUID-potwierdzonej-kategorii>"]
  }
]
```

**Etap B — aplikacja**

1. Na krótkie okno przełączenia wstrzymać zapisy harmonogramu/floty do starej wersji. Stara wersja nie egzekwuje nowej reguły, więc pomiędzy audytem a przełączeniem może wprowadzić kolejną niezgodność.
2. Ponowić audyt każdej szkoły; bramka: `ready: true`, zero brakujących kategorii i zero niezgodnych trwających/przyszłych jazd. Jest to warunek wdrożenia operacyjnego, nie automatyczna poprawka danych.
3. Wdrożyć backend wraz z wygenerowanym klientem Prisma i frontend/BFF zgodnego kontraktu. Wyłączyć stare instancje przyjmujące zapisy. Zweryfikować logowanie, odczyt floty, zapis formularza i przykładową rezerwację zgodną oraz odrzuconą niezgodną.
4. Wznowić zapisy, monitorować odsetek błędów zgodności i NO_VEHICLE_AVAILABLE oraz 409 przy konflikcie zmian.

Etap A realizuje przygotowanie danych z planu przez skrypt administracyjny i kompatybilną migrację; formularz nowej wersji służy dalszemu utrzymaniu floty. Próba wdrożenia nie obejmowała DEV ani PROD.

## Zachowanie istniejących danych

Pojazd bez kategorii pozostaje widoczny z etykietą „Uzupełnij kategorie”. Nowy pojazd wymaga co najmniej jednej kategorii. Historia nie jest przepisywana. Odczyt/anulowanie dawnych lekcji jest możliwe; rzeczywista zmiana terminu, pojazdu lub instruktora wymaga zgodności.

Usunięcie kategorii używanej przez trwającą/przyszłą lekcję SCHEDULED lub aktywne wydarzenie DRIVE/PLANNED z kursem daje 409. Najpierw poprawić przypisany pojazd w zajęciach. Normalne DRIVE bez kursu zachowuje dotychczasowe zasady.

## Wycofanie

Pozostawić migrację i przypisania w bazie — są dodatkiem zgodnym ze starym kodem. Wycofanie samej aplikacji przywraca dawny brak walidacji; do czasu ponownego wdrożenia utrzymać ograniczenie zapisów albo ręcznie kontrolować zgodność. Nie usuwać tabeli relacji i nie kasować mapowań jako kroku rollbacku.

## Weryfikacja lokalna

Testy integracyjne korzystają z jawnego TEST_DATABASE_URL i istniejącego runnera `npm run test:integration`. Obejmują tworzenie, dobór domyślnego pojazdu, edycję, options/check, blokadę usuwania kategorii, konwersję/reaktywację wydarzeń, cały slot, RLS i równoległy zapis z usuwaniem kategorii. Narzędzie mapowania ma test próby bez zapisu, dwukrotnego zastosowania i odrzucenia pojazdu spoza zakresu.

Testy Playwright: `e2e/specs/ui/vehicle-categories.spec.ts`. Regresja dodatkowo obejmuje upload zdjęć oraz zmianę instruktora pojedynczej lekcji. Szczegółowe wyniki bieżącej implementacji są w głównym planie: `docs/VEHICLE_COURSE_CATEGORIES_IMPLEMENTATION_PLAN.md` w katalogu nadrzędnym projektu.
