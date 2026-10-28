import { isIP } from 'node:net';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import type { SecurityLogFilters } from '../../schemas/security-log.schemas';

function dateStart(value: string): Date {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
		throw AppError.badRequest('Nieprawidłowa data filtra');
	const midnightUtc = Date.parse(`${value}T00:00:00Z`);
	if (
		!Number.isFinite(midnightUtc) ||
		new Date(midnightUtc).toISOString().slice(0, 10) !== value
	)
		throw AppError.badRequest('Nieprawidłowa data filtra');
	const formatter = new Intl.DateTimeFormat('en-US', {
		timeZone: 'Europe/Warsaw',
		timeZoneName: 'shortOffset',
	});
	let candidate = midnightUtc - 3600_000;
	for (let i = 0; i < 2; i++) {
		const zone =
			formatter
				.formatToParts(new Date(candidate))
				.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+1';
		const [, sign, hours, minutes] =
			/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(zone) ?? [];
		if (!sign || !hours)
			throw AppError.badRequest('Nieprawidłowa strefa daty');
		const offset =
			(Number(hours) * 60 + Number(minutes ?? 0)) *
			(sign === '+' ? 1 : -1);
		candidate = midnightUtc - offset * 60_000;
	}
	return new Date(candidate);
}

function nextDay(value: string): Date {
	const utc = Date.parse(`${value}T00:00:00Z`);
	return dateStart(new Date(utc + 86_400_000).toISOString().slice(0, 10));
}

function stringCondition(
	operator: string,
	value: unknown,
): Prisma.StringFilter {
	if (operator === 'is' && typeof value === 'string')
		return { equals: value };
	if (operator === 'isNot' && typeof value === 'string')
		return { not: value };
	if (operator === 'oneOf' && Array.isArray(value))
		return { in: value as string[] };
	throw AppError.badRequest('Nieprawidłowy operator filtra');
}

export function filterConditions(
	filters: SecurityLogFilters,
): Prisma.SecurityEventSchoolWhereInput[] {
	return filters.rules.map(({ field, operator, value }) => {
		if (field === 'occurredAt') {
			if (
				operator === 'between' &&
				value &&
				typeof value === 'object' &&
				!Array.isArray(value) &&
				value.from <= value.to
			)
				return {
					occurredAt: {
						gte: dateStart(value.from),
						lt: nextDay(value.to),
					},
				};
			if (typeof value !== 'string')
				throw AppError.badRequest('Nieprawidłowa data filtra');
			if (operator === 'on')
				return {
					occurredAt: { gte: dateStart(value), lt: nextDay(value) },
				};
			if (operator === 'before')
				return { occurredAt: { lt: dateStart(value) } };
			if (operator === 'after')
				return { occurredAt: { gte: nextDay(value) } };
			throw AppError.badRequest('Nieprawidłowy operator daty');
		}
		if (field === 'clientIp') {
			if (operator === 'isEmpty') return { event: { clientIp: null } };
			if (
				typeof value !== 'string' ||
				!isIP(value) ||
				!['is', 'isNot'].includes(operator)
			)
				throw AppError.badRequest('Nieprawidłowy adres IP');
			return { event: { clientIp: stringCondition(operator, value) } };
		}
		if (field === 'actorUserId' || field === 'targetUserId') {
			if (
				typeof value !== 'string' ||
				!/^[0-9a-f-]{36}$/i.test(value) ||
				!['is', 'isNot'].includes(operator)
			)
				throw AppError.badRequest('Nieprawidłowy filtr użytkownika');
			return { [field]: stringCondition(operator, value) };
		}
		if (field === 'actorVisibility' || field === 'actorRole')
			return { [field]: stringCondition(operator, value) };
		if (field === 'httpStatus') {
			if (
				operator === 'oneOf' &&
				Array.isArray(value) &&
				value.every((v) => /^\d{3}$/.test(v))
			)
				return { event: { httpStatus: { in: value.map(Number) } } };
			if (
				typeof value === 'string' &&
				/^\d{3}$/.test(value) &&
				['is', 'isNot'].includes(operator)
			)
				return {
					event: {
						httpStatus:
							operator === 'is'
								? { equals: Number(value) }
								: { not: Number(value) },
					},
				};
			throw AppError.badRequest('Nieprawidłowy kod HTTP');
		}
		return { event: { [field]: stringCondition(operator, value) } };
	});
}
