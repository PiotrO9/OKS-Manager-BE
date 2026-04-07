import type { Request } from 'express';
import { AppError } from './AppError';

export function requireUser(req: Request): NonNullable<Request['user']> {
	if (!req.user) {
		throw AppError.unauthorized('Unauthorized');
	}
	return req.user;
}
