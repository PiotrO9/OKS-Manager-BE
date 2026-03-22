# OSK Manager - Backend

Prosty szkielet backendu z Express i Prisma (SQLite).

Instrukcja uruchomienia:

1. Zainstaluj zależności:

    npm install

2. Wygeneruj klienta Prisma:

    npx prisma generate

3. Utwórz migrację i bazę danych (opcjonalne):

    npx prisma migrate dev --name init

4. Uruchom w trybie deweloperskim:

    npm run dev

API:

- GET / -> powitanie
- GET /users -> lista użytkowników
- POST /users -> utwórz użytkownika { email, name }
