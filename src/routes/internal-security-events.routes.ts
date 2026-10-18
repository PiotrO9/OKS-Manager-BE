import { createHmac, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { sendJsonError, sendJsonSuccess } from '../lib/apiResponse';
import { asyncHandler } from '../lib/http/asyncHandler';
import { lookupSecurityOperation } from '../middleware/securityOperationContext';
import { recordSecurityEvent } from '../services/security-events/record';

const MAX_SIGNED_DENIALS_PER_MINUTE = 1000;
const intakeCounts = new Map<string, { startedAt: number; count: number }>();

function intakeAllowed(remoteAddress: string | undefined): boolean {
	const key = remoteAddress ?? 'unknown';
	const now = Date.now();
	const previous = intakeCounts.get(key);
	if (!previous || now - previous.startedAt >= 60_000) {
		if (intakeCounts.size >= 1024) {
			for (const [address, value] of intakeCounts) {
				if (now - value.startedAt >= 60_000)
					intakeCounts.delete(address);
			}
			if (intakeCounts.size >= 1024)
				intakeCounts.delete(intakeCounts.keys().next().value!);
		}
		intakeCounts.set(key, { startedAt: now, count: 1 });
		return true;
	}
	if (previous.count >= MAX_SIGNED_DENIALS_PER_MINUTE) return false;
	previous.count += 1;
	return true;
}

const denialSchema = z
	.object({
		attemptId: z.string().uuid(),
		method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
		path: z
			.string()
			.startsWith('/')
			.max(200)
			.refine((value) => !value.includes('?') && !value.includes('#')),
		reasonCode: z.literal('MISSING_SESSION'),
	})
	.strict();

function validSignature(
	secret: string,
	timestamp: string,
	signature: string,
	body: unknown,
): boolean {
	const supplied = /^sha256=([0-9a-f]{64})$/.exec(signature)?.[1];
	if (!supplied) return false;
	const expected = createHmac('sha256', secret)
		.update(`${timestamp}.${JSON.stringify(body)}`)
		.digest();
	return timingSafeEqual(expected, Buffer.from(supplied, 'hex'));
}

export function createInternalSecurityEventsRouter() {
	const router = Router();
	router.post(
		'/bff-denial',
		asyncHandler(async (req, res) => {
			res.setHeader('Cache-Control', 'no-store');
			const secret = process.env.SECURITY_LOGS_BFF_SHARED_SECRET;
			if (!secret || secret.length < 32)
				return sendJsonError(res, 'Audit intake unavailable', 503);

			const timestamp = req.header('X-OSK-Audit-Timestamp') ?? '';
			const signature = req.header('X-OSK-Audit-Signature') ?? '';
			const timestampMs = Date.parse(timestamp);
			if (
				!Number.isFinite(timestampMs) ||
				Math.abs(Date.now() - timestampMs) > 5 * 60_000 ||
				!validSignature(secret, timestamp, signature, req.body)
			) {
				return sendJsonError(res, 'Unauthorized', 401);
			}

			const parsed = denialSchema.safeParse(req.body);
			if (!parsed.success)
				return sendJsonError(res, 'Invalid security event', 400);
			const operation = lookupSecurityOperation(
				parsed.data.method,
				parsed.data.path,
			);
			if (!operation || operation.routeTemplate.startsWith('/auth/')) {
				return sendJsonError(res, 'Unknown operation', 400);
			}
			if (!intakeAllowed(req.socket.remoteAddress)) {
				return sendJsonError(
					res,
					'Audit intake rate limit exceeded',
					429,
				);
			}

			const result = await recordSecurityEvent({
				type: 'AUTHENTICATION_REQUIRED',
				source: 'BFF_INTERNAL',
				attemptId: parsed.data.attemptId,
				eventPhase: 'RESULT',
				outcome: 'DENIED',
				reasonCode: parsed.data.reasonCode,
				operationCode: operation.code,
				operationLabel: operation.label,
				httpMethod: operation.method,
				routeTemplate: operation.routeTemplate,
				httpStatus: 401,
				ipSource: 'UNKNOWN',
				schoolScopes: [],
			});
			return sendJsonSuccess(
				res,
				{ accepted: true, created: result.created },
				202,
			);
		}),
	);
	return router;
}
