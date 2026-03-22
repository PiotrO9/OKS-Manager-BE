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

4. Wdróż schemę do bazy (szybki sposób):

```bash
npx prisma db push
```

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
