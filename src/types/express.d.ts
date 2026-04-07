import type { Prisma } from '@prisma/client';

export type AuthRequestUser = Prisma.UserGetPayload<{
	include: { profile: true };
}>;

declare global {
	namespace Express {
		interface Request {
			user?: AuthRequestUser;
		}
	}
}

export {};
