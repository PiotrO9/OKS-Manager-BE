import {
	createHash,
	createHmac,
	randomBytes,
	timingSafeEqual,
} from 'node:crypto';
import { AppError } from '../../lib/http/AppError';
import type { ListInput } from './listTypes';
const processCursorKey = randomBytes(32);
type CursorPayload = {
	actorId: string;
	schoolId: string;
	fingerprint: string;
	direction: 'older' | 'newer';
	occurredAt: string;
	eventId: string;
	expiresAt: number;
};

function cursorKey(): Buffer {
	const configured = process.env.SECURITY_LOG_CURSOR_SECRET;
	return configured && configured.length >= 32
		? Buffer.from(configured)
		: processCursorKey;
}

export function fingerprint(input: ListInput): string {
	return createHash('sha256')
		.update(
			JSON.stringify({
				search: input.search,
				view: input.view,
				filters: input.filters,
				limit: input.limit,
			}),
		)
		.digest('hex');
}

export function encodeCursor(payload: CursorPayload): string {
	const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
	const mac = createHmac('sha256', cursorKey())
		.update(body)
		.digest('base64url');
	return `${body}.${mac}`;
}

export function decodeCursor(
	value: string,
	actorId: string,
	input: ListInput,
): CursorPayload {
	const [body, signature, extra] = value.split('.');
	if (!body || !signature || extra)
		throw AppError.badRequest('Nieprawidłowy kursor listy');
	const expected = createHmac('sha256', cursorKey()).update(body).digest();
	let actual: Buffer;
	try {
		actual = Buffer.from(signature, 'base64url');
	} catch {
		throw AppError.badRequest('Nieprawidłowy kursor listy');
	}
	if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
		throw AppError.badRequest('Nieprawidłowy kursor listy');
	let payload: CursorPayload;
	try {
		payload = JSON.parse(
			Buffer.from(body, 'base64url').toString('utf8'),
		) as CursorPayload;
	} catch {
		throw AppError.badRequest('Nieprawidłowy kursor listy');
	}
	if (
		payload.actorId !== actorId ||
		payload.schoolId !== input.schoolId ||
		payload.fingerprint !== fingerprint(input) ||
		payload.expiresAt < Date.now() ||
		!['older', 'newer'].includes(payload.direction) ||
		!/^[0-9a-f-]{36}$/i.test(payload.eventId) ||
		!Number.isFinite(Date.parse(payload.occurredAt))
	) {
		throw AppError.badRequest('Kursor wygasł lub nie pasuje do filtrów');
	}
	return payload;
}
