import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma?: PrismaClient;
}

function createPrismaClient(): PrismaClient {
  return new PrismaClient();
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
