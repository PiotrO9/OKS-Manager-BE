import type { Prisma } from '@prisma/client';

export type AuthRequestUser = Prisma.UserGetPayload<{
	include: { profile: true };
}>;

declare global {
	namespace Express {
		interface Request {
			requestId?: string;
			user?: AuthRequestUser;
		}
	}
}

export {};
