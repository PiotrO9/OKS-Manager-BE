import { z } from 'zod';

export const UUID_PARAM_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const uuidSchema = z.string().regex(UUID_PARAM_RE, 'Invalid id');

function firstQueryValue(val: unknown): unknown {
	if (Array.isArray(val)) {
		if (val.length === 0) {
			return undefined;
		}
		return val[0];
	}
	return val;
}

export function parseUuidParam(raw: unknown): string | null | 'invalid' {
	if (raw === undefined || raw === null) {
		return null;
	}
	if (Array.isArray(raw)) {
		if (raw.length === 0) {
			return null;
		}
		return parseUuidParam(raw[0]);
	}
	if (typeof raw !== 'string') {
		return 'invalid';
	}
	const id = raw.trim();
	if (id === '') {
		return null;
	}
	return UUID_PARAM_RE.test(id) ? id : 'invalid';
}

export function parseUuidPathParam(
	raw: string | string[] | undefined,
): string | null {
	if (raw === undefined) {
		return null;
	}
	const single = Array.isArray(raw) ? raw[0] : raw;
	if (typeof single !== 'string') {
		return null;
	}
	const id = single.trim();
	return UUID_PARAM_RE.test(id) ? id : null;
}

export function zodPreprocessQueryFirst<T extends z.ZodTypeAny>(schema: T) {
	return z.preprocess(firstQueryValue, schema);
}
