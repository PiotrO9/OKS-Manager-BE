import type { Request } from 'express';
import type { User } from '@prisma/client';
import { AppError } from './AppError';

export function requireUser(req: Request): User {
	if (!req.user) {
		throw AppError.unauthorized('Unauthorized');
	}
	return req.user;
}
