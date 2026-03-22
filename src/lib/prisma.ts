import { PrismaClient } from '@prisma/client';

declare global {
	// eslint-disable-next-line no-var
	var __prisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
	const connectionString = process.env.DATABASE_URL || '';
	if (!connectionString && process.env.NODE_ENV !== 'test') {
		// eslint-disable-next-line no-console
		console.warn('Warning: DATABASE_URL is not set — Prisma client may fail to connect');
	}

	// Prisma 7 requires a driver adapter (e.g. @prisma/adapter-pg for PostgreSQL).
	// Try to load it dynamically so the code still runs if the package is not installed.
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
		const { PrismaPg } = require('@prisma/adapter-pg') as { PrismaPg: any };
		const adapter = new PrismaPg({ connectionString });
		return new PrismaClient({ adapter });
	} catch (err) {
		// eslint-disable-next-line no-console
		console.warn(
			"Prisma adapter @prisma/adapter-pg not installed or failed to load. Falling back to default PrismaClient().",
		);
		console.warn('Install adapter for full PostgreSQL support: npm install @prisma/adapter-pg');
		return new PrismaClient();
	}
}

export function getPrisma(): PrismaClient {
	if (process.env.NODE_ENV === 'production') {
		return createPrismaClient();
	}
	// @ts-ignore
	if (!global.__prisma) {
		// @ts-ignore
		global.__prisma = createPrismaClient();
	}
	// @ts-ignore
	return global.__prisma;
}
