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

The audit reset workflow is documented in [AUDIT_DATA_TOOLING.md](AUDIT_DATA_TOOLING.md).
Both reset APIs are intended only for an isolated test project. Never point them
at the shared DEV project while another task is using it.

The manual reset endpoint is:

```text
POST /dev/reset-and-seed
```

The JSON body is optional. Data volumes accept `low`, `default`, or `high`:

```json
{
	"schools": "low",
	"students": "low",
	"lessons": "high",
	"randomSeed": "manual-schedule-test"
}
```

Supported fields are `schools`, `instructors`, `students`, `vehicles`,
`courses`, `courseParticipants`, `lessons`, `events`, and `timeBlocks`.
Omitted fields use `default`; `schools` is the exception and defaults to
`low`, which creates exactly one school. Reusing `randomSeed` reproduces the
same volume plan.

It requires:

- a valid Bearer access token,
- a user with role `ADMIN`,
- `ALLOW_DB_RESET=true` and `ALLOW_DB_FULL_RESET=true`,
- `NODE_ENV` different from `production`,
- a 32-character or longer `AUDIT_RESET_CONFIRM_SECRET`,
- `AUDIT_RESET_TARGET_FINGERPRINT` matching the current database target,
- the HTTP header `x-audit-full-confirmation: WIPE AUDIT DATABASE`.

After using it, set:

```env
ALLOW_DB_RESET=false
ALLOW_DB_FULL_RESET=false
```

and restart the backend.
