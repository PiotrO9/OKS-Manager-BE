# OSK Manager BE

Instrukcja minimalnej konfiguracji aby uruchomić aplikację z Prisma + Supabase Postgres

Uwaga: Ten projekt został przystosowany do używania Supabase Postgres jako jedynej bazy danych. Lokalne SQLite (dev.db) i skrypty migracji SQLite zostały usunięte.

1. Skopiuj `.env.example` do `.env` i uzupełnij wartości:

```env
DATABASE_URL="postgresql://<db_user>:<db_pass>@<db_host>:5432/postgres?sslmode=require"
SUPABASE_URL="https://<your-project>.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
SUPABASE_ANON_KEY="<anon-key>"
PORT=3001
NODE_ENV=development
```

2. Zainstaluj zależności:

```bash
npm install
```

3. Wygeneruj klienta Prisma:

```bash
npx prisma generate
```

4. Utwórz migrację na bazie DEV:

```bash
npx prisma migrate dev --name <change-name>
```

Na produkcji używaj tylko już utworzonych migracji:

```bash
npx prisma migrate deploy
```

Szczegóły procesu są opisane w `docs/DATABASE_WORKFLOW.md`.

Mechanizm walidacji terminarza, dostępnych godzin i konfliktów zapisu jest
opisany w [docs/SCHEDULE_AVAILABILITY.md](docs/SCHEDULE_AVAILABILITY.md).

## Dziennik bezpieczeństwa

Migracja `20261018120000_security_events` tworzy tabele zdarzeń, projekcji dla szkół i stanu detekcji. Uruchom ją istniejącym procesem migracji przed włączeniem producentów zdarzeń. API managera jest dostępne pod `/manager/security-logs` i wymaga roli `MANAGER` oraz własności wskazanej szkoły.

Ustaw trzy niezależne sekrety o długości co najmniej 32 znaków: `SECURITY_EVENT_HMAC_KEY` (korelacja loginów), `SECURITY_LOG_CURSOR_SECRET` (kursory listy) i `SECURITY_LOGS_BFF_SHARED_SECRET` (podpis zgłoszeń BFF). Ostatni sekret musi mieć tę samą wartość w BE i Nuxt; nigdy nie umieszczaj go w `NUXT_PUBLIC_*`. `SECURITY_EVENT_HMAC_KEY_VERSION` identyfikuje wersję klucza. Worker detekcji uruchamia się przy starcie serwera co 5 sekund; retencja usuwa rekordy starsze niż 90 dni w partiach co godzinę. Można to kontrolować zmiennymi `SECURITY_EVENTS_DETECTION_ENABLED`, `SECURITY_EVENTS_RETENTION_ENABLED` i `SECURITY_EVENTS_RETENTION_DAYS`.

`POST /internal/security-events/bff-denial` jest wyłącznie wejściem serwer–serwer. Wymaga podpisu HMAC i nie ma adaptera przeglądarkowego. Bez skonfigurowanego sekretu zwraca 503. Przy typowej ścieżce przez BFF/proxy adres klienta pozostaje nieznany; kod nie ufa klientowskiemu `X-Forwarded-For`. `SECURITY_EVENTS_DIRECT_CLIENT_SOCKET=true` wolno ustawić tylko wtedy, gdy BE rzeczywiście odbiera połączenia bez pośrednika.

Po zastosowaniu migracji na DEV można uruchomić `npm run build`, a następnie `node scripts/security-events-dev-smoke.mjs --confirm-dev`. Skrypt wymaga `NODE_ENV=development`, weryfikuje zapis, odczyt, izolację OSK, odmowę HTTP, podpis BFF i detekcję pięciu prób na prawdziwej bazie; własne wpisy testowe usuwa po zakończeniu. Nie uruchamiaj go na PROD.

Migracja `20261018170000_security_monitor_health` dodaje wspólny stan monitorowania i indeksy detekcji. Zastosuj ją przed uruchomieniem nowej wersji. Lista zwraca teraz rzeczywisty `collectionStatus`: `UNKNOWN` przy braku danych o workerze lub błędzie odczytu, `DEGRADED` przy niepełnej konfiguracji, wyłączonym/starym workerze (30 s), znanej awarii z ostatnich 5 minut lub nieaktywnych od ponad 30 s zaległościach. `OK` oznacza brak znanej degradacji backendu, nie gwarancję kompletności historii ani dostępności każdego BFF. Heartbeat jest zapisywany również bez ruchu użytkowników. Zapisy statusu są ograniczone do jednego sukcesu na 5 s na proces/komponent, z limitem transakcji 1,5 s i oczekiwania na połączenie 0,5 s.

Spóźniona próba cofa kursor właściwej reguły w transakcji zapisu. Detektor przelicza późniejsze okna i sprawdza istniejące alarmy, także te ze starszej wersji modułu, zamiast zmieniać historię. Wersja HMAC jest taka sama w zdarzeniu i kluczu stanu; rotacja otwiera nowe okno korelacji nieznanych loginów, bez łączenia skrótów różnych wersji. Konta znane są nadal korelowane po identyfikatorze użytkownika.

Weryfikacja uzupełniająca na DEV:

```bash
node scripts/security-events-preflight.mjs
npm run build
node scripts/security-events-reliability-smoke.mjs --confirm-dev
```

Drugi skrypt sprawdza opóźnione zdarzenia, deduplikację po cofnięciu kursora, równoległe procesy, blokadę UPDATE, RLS/granty i wspólny heartbeat. Usuwa wyłącznie własne syntetyczne zdarzenia/stany, a raport zapisuje w `../output/bsi-project/reliability-results.json` (katalog jest tworzony automatycznie). Skrypty nie resetują DEV. Heartbeat pozostaje jako rzeczywista informacja diagnostyczna. Przed produkcją wymagane są test obciążeniowy, potwierdzenie topologii proxy/IP, pełny audyt maskowanych odmów 404 i decyzja o trwałym buforowaniu przy awarii bazy. Retry BFF ma maksymalnie dwie próby ze stałym podpisanym identyfikatorem i nie stanowi trwałej kolejki.

## Homelab Deployment

Pushes to `main` run the backend CI workflow. When CI passes, it triggers the homelab deployment workflow in the deploy repository.

5. Uruchom aplikację w trybie deweloperskim:

```bash
npm run dev
```

6. Testy:
- GET /test — powinien zwrócić prosty komunikat.
- GET /db-test — test połączenia z bazą i pobranie próbki użytkownika.

Uwagi:
- Nie commituj prawdziwych kluczy do repo.
- Upewnij się, że `DATABASE_URL` jest connection stringiem do Supabase Postgres.
- Service Role Key przechowuj tylko na backendzie.
- Jeśli chcesz przywrócić migracje SQLite lub narzędzia migracji, powiadom mnie — mogę pomóc przywrócić je w bezpieczny sposób.
