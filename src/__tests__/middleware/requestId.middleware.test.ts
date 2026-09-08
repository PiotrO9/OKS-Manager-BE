import { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
	normalizeRequestId,
	REQUEST_ID_HEADER,
	requestIdMiddleware,
} from '../../middleware/requestId.middleware';

function createResponse() {
	const headers = new Map<string, string>();

	const res = {
		setHeader: vi.fn((name: string, value: string) => {
			headers.set(name.toLowerCase(), value);
		}),
	} as unknown as Response;

	return { headers, res };
}

describe('requestIdMiddleware', () => {
	it('uses incoming X-Request-Id when it is valid', () => {
		const req = {
			headers: { [REQUEST_ID_HEADER]: 'client-request-id' },
		} as unknown as Request;
		const { headers, res } = createResponse();
		const next: NextFunction = vi.fn();

		requestIdMiddleware(req, res, next);

		expect(req.requestId).toBe('client-request-id');
		expect(headers.get(REQUEST_ID_HEADER)).toBe('client-request-id');
		expect(next).toHaveBeenCalledOnce();
	});

	it('generates request ID when incoming header is missing', () => {
		const req = { headers: {} } as Request;
		const { headers, res } = createResponse();
		const next: NextFunction = vi.fn();

		requestIdMiddleware(req, res, next);

		expect(req.requestId).toEqual(expect.any(String));
		expect(req.requestId).toHaveLength(36);
		expect(headers.get(REQUEST_ID_HEADER)).toBe(req.requestId);
		expect(next).toHaveBeenCalledOnce();
	});
});

describe('normalizeRequestId', () => {
	it('rejects empty, non-string and oversized values', () => {
		expect(normalizeRequestId('')).toBeNull();
		expect(normalizeRequestId('   ')).toBeNull();
		expect(normalizeRequestId(['abc'])).toBeNull();
		expect(normalizeRequestId('x'.repeat(129))).toBeNull();
	});

	it('trims accepted values', () => {
		expect(normalizeRequestId(' request-id ')).toBe('request-id');
	});
});
