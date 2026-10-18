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
