import { getPrisma } from '../../lib/prisma';

// Preserve the single client previously owned by check.ts, including in production.
export const scheduleCheckDatabase = getPrisma();
