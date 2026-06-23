import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { sendJsonError } from '../apiResponse';
import { AppError } from './AppError';

export const errorRequestHandler: ErrorRequestHandler = (
	err,
	req,
	res,
	next,
) => {
	if (res.headersSent) {
		next(err);
		return;
	}

	if (err instanceof AppError) {
		sendJsonError(res, err.message, err.statusCode);
		return;
	}

	if (err instanceof ZodError) {
		const message = err.issues[0]?.message ?? 'Validation error';
		sendJsonError(res, message, 400);
		return;
	}

	 
	console.error('Unhandled error', err);
	sendJsonError(res, 'Internal server error', 500);
};
