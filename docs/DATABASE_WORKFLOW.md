# Database Workflow

This backend uses Prisma with Supabase Postgres.

## Environments

- Local development uses the Supabase DEV project.
- Homelab production uses the Supabase PROD project.
- Real secrets must stay in `.env` files and must not be committed.

## Development Migrations

Use DEV for schema work.

1. Edit `prisma/schema.prisma`.
2. Create and apply a migration against the DEV database:

```bash
npx prisma migrate dev --name <change-name>
```

3. Test the application locally.
4. Commit both:
   - `prisma/schema.prisma`
   - the generated folder in `prisma/migrations`

## Production Migrations

Use PROD only for applying already committed migrations.

On the homelab, with `.env` pointing to the Supabase PROD database:

```bash
npx prisma migrate deploy
```

Then rebuild/restart the containers:

```bash
docker compose up -d --build
```

## Do Not

- Do not use `prisma db push` against PROD.
- Do not edit the production schema manually in the Supabase Dashboard.
- Do not commit `.env`, Supabase service role keys, database URLs, or JWT secrets.

## Reset And Seed

The manual reset endpoint is:

```text
POST /dev/reset-and-seed
```

It requires:

- a valid Bearer access token,
- a user with role `ADMIN`,
- `ALLOW_DB_RESET=true` in the backend environment.

After using it, set:

```env
ALLOW_DB_RESET=false
```

and restart the backend.

