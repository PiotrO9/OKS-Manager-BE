import { Response } from 'express';

export type ApiSuccessBody<T = unknown> = {
	success: true;
	data?: T;
};

export type ApiErrorBody = {
	success: false;
	error: string;
};

/**
 * Zgodnie z context/api-guidelines — jednolita koperta JSON.
 */
export function sendJsonSuccess<T>(
	res: Response,
	data?: T,
	statusCode = 200,
): Response {
	if (data !== undefined) {
		return res.status(statusCode).json({ success: true, data });
	}
	return res.status(statusCode).json({ success: true });
}

export function sendJsonError(
	res: Response,
	error: string,
	statusCode = 400,
): Response {
	return res.status(statusCode).json({ success: false, error });
}
