import type { z } from 'zod';
import { AppError } from '../lib/http/AppError';

type RequestPartLabel = 'params' | 'query' | 'body';
type ParserResult<TData> =
	| { ok: true; data: TData }
	| { ok: false; error: string };

export function parseRequestPart<TSchema extends z.ZodType>(
	schema: TSchema,
	value: unknown,
	label: RequestPartLabel,
): z.infer<TSchema> {
	const parsed = schema.safeParse(value);
	if (!parsed.success) {
		const message =
			parsed.error.issues[0]?.message ?? `Invalid ${label}`;
		throw AppError.badRequest(message);
	}

	return parsed.data;
}

export function parseBodyWithParser<TData>(
	parser: (value: unknown) => ParserResult<TData>,
	value: unknown,
): TData {
	const parsed = parser(value);
	if (!parsed.ok) {
		throw AppError.badRequest(parsed.error);
	}

	return parsed.data;
}
