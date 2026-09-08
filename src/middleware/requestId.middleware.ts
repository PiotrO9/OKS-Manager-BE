import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

const REQUEST_ID_HEADER = 'x-request-id';
const MAX_REQUEST_ID_LENGTH = 128;

function normalizeRequestId(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const trimmed = value.trim();
	if (!trimmed || trimmed.length > MAX_REQUEST_ID_LENGTH) {
		return null;
	}

	return trimmed;
}

function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
	const requestId =
		normalizeRequestId(req.headers[REQUEST_ID_HEADER]) ?? randomUUID();

	req.requestId = requestId;
	res.setHeader(REQUEST_ID_HEADER, requestId);

	next();
}

export { requestIdMiddleware, normalizeRequestId, REQUEST_ID_HEADER };
