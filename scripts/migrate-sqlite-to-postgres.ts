import dotenv from 'dotenv';
import { PrismaClient as PrismaClientSqlite } from '@prisma/client';
import { PrismaClient as PrismaClientPostgres } from '@prisma/client';

// This script assumes you have two env vars set before running:
// SQLITE_DATABASE_URL (e.g., file:./dev.db) and DATABASE_URL (Postgres)
// It will read users from SQLite and insert into Postgres using upsert by email.

dotenv.config();

async function run() {
  const sqliteUrl = process.env.SQLITE_DATABASE_URL || 'file:./dev.db';
  const pgUrl = process.env.DATABASE_URL;

  if (!pgUrl) {
    console.error('Missing DATABASE_URL in env. Aborting.');
    process.exit(1);
  }

  // Create two Prisma clients with different datasources by passing datasources in the constructor
  const sqliteClient = new PrismaClientSqlite({ datasources: { db: { url: sqliteUrl } } } as any);
  const pgClient = new PrismaClientPostgres({ datasources: { db: { url: pgUrl } } } as any);

  try {
    const users = await sqliteClient.user.findMany();
    console.log(`Found ${users.length} users in SQLite`);

    for (const u of users) {
      try {
        await pgClient.user.upsert({
          where: { email: u.email },
          update: { name: u.name },
          create: { email: u.email, name: u.name, createdAt: u.createdAt },
        });
      } catch (err) {
        console.error('Error upserting user', u.email, err);
      }
    }

    console.log('Migration finished');
  } finally {
    await sqliteClient.$disconnect();
    await pgClient.$disconnect();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
