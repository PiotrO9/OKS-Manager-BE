import { afterEach, expect, it, vi } from 'vitest';
import { getPrisma } from '../lib/prisma';

afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
});

it('reuses the same Prisma client across calls in production', () => {
	vi.stubEnv('NODE_ENV', 'production');
	vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/test');
	vi.stubGlobal('__oskManagerPrisma', undefined);

	const client = getPrisma();

	expect(getPrisma() === client).toBe(true);
});
