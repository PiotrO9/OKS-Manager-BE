import type { Prisma } from '@prisma/client';
import type { SecurityOperation } from '../middleware/securityOperationContext';

export type AuthRequestUser = Prisma.UserGetPayload<{
	include: { profile: true };
}>;

declare global {
	namespace Express {
		interface Request {
			requestId?: string;
			user?: AuthRequestUser;
			securityOperation?: SecurityOperation;
		}
	}
}

export {};
