import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

declare global {
	var __oskManagerPrisma: PrismaClient | undefined;
}

function createPrismaClient(): PrismaClient {
	const connectionString = process.env.DATABASE_URL || '';
	if (!connectionString && process.env.NODE_ENV !== 'test') {
		console.warn(
			'Warning: DATABASE_URL is not set - Prisma client may fail to connect',
		);
	}

	const adapter = new PrismaPg({ connectionString });
	return new PrismaClient({ adapter });
}

export function getPrisma(): PrismaClient {
	if (process.env.NODE_ENV === 'production') {
		return createPrismaClient();
	}

	if (!globalThis.__oskManagerPrisma) {
		globalThis.__oskManagerPrisma = createPrismaClient();
	}

	return globalThis.__oskManagerPrisma;
}
