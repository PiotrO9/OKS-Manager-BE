import {
	createHash,
	createHmac,
	randomBytes,
	timingSafeEqual,
} from 'node:crypto';
import { isIP } from 'node:net';
import { Prisma } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import { getSecurityCollectionStatus } from './health';
import type { SecurityLogFilters } from '../../schemas/security-log.schemas';

const prisma = getPrisma();
const processCursorKey = randomBytes(32);
const viewTypes: Record<string, string[] | null> = {
	all: null,
	'failed-logins': [
		'LOGIN_FAILED',
		'LOGIN_DENIED',
		'LOGIN_PROVIDER_ERROR',
		'LOGIN_RATE_LIMITED',
	],
	suspicious: [
		'REPEATED_LOGIN_FAILURES',
		'REVOKED_SESSION_USED',
		'ACCESS_DENIED',
	],
	'access-denied': [
		'ACCESS_DENIED',
		'AUTHENTICATION_REQUIRED',
		'SESSION_REJECTED',
	],
	'account-changes': [
		'ACCOUNT_CREATED',
		'ACCOUNT_BLOCKED',
		'ACCOUNT_UNBLOCKED',
		'ACCOUNT_ARCHIVED',
		'ACCOUNT_EMAIL_CHANGE_REQUESTED',
		'ACCOUNT_EMAIL_CHANGED',
		'ACCOUNT_CHANGE_FAILED',
		'ACCOUNT_CHANGE_REPAIR_REQUIRED',
		'PASSWORD_CHANGED',
		'PASSWORD_CHANGE_COMPLETED',
	],
};

type ListInput = {
	schoolId: string;
	limit: number;
	cursor?: string;
	search: string;
	view: string;
	filters: SecurityLogFilters;
};
type CursorPayload = {
	actorId: string;
	schoolId: string;
	fingerprint: string;
	direction: 'older' | 'newer';
	occurredAt: string;
	eventId: string;
	expiresAt: number;
};

async function assertSchool(actorId: string, schoolId: string) {
	const school = await prisma.drivingSchool.findFirst({
		where: { id: schoolId, ownerId: actorId, deletedAt: null },
		select: { id: true },
	});
	if (!school) throw AppError.notFound('Nie znaleziono OSK');
}

function cursorKey(): Buffer {
	const configured = process.env.SECURITY_LOG_CURSOR_SECRET;
	return configured && configured.length >= 32
		? Buffer.from(configured)
		: processCursorKey;
}

function fingerprint(input: ListInput): string {
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

function encodeCursor(payload: CursorPayload): string {
	const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
	const mac = createHmac('sha256', cursorKey())
		.update(body)
		.digest('base64url');
	return `${body}.${mac}`;
}

function decodeCursor(
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

function filterConditions(
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

function rowDto(
	row: Prisma.SecurityEventSchoolGetPayload<{ include: { event: true } }>,
) {
	return {
		id: row.eventId,
		occurredAt: row.occurredAt.toISOString(),
		type: row.event.type,
		category: row.event.category,
		severity: row.event.severity,
		outcome: row.event.outcome,
		reasonCode: row.event.reasonCode,
		operationCode: row.event.operationCode,
		operationLabel: row.event.operationLabelSnapshot,
		httpMethod: row.event.httpMethod,
		routeTemplate: row.event.routeTemplate,
		httpStatus: row.event.httpStatus,
		actor: {
			visibility: row.actorVisibility,
			userId: row.actorUserId,
			displayName: row.actorDisplayName,
			role: row.actorRole,
		},
		target: {
			userId: row.targetUserId,
			displayName: row.targetDisplayName,
		},
		clientIp: row.event.clientIp,
		requestId: row.event.requestId,
	};
}

export async function listManagerSecurityLogs(
	actorId: string,
	input: ListInput,
) {
	await assertSchool(actorId, input.schoolId);
	const cursor = input.cursor
		? decodeCursor(input.cursor, actorId, input)
		: null;
	const conditions: Prisma.SecurityEventSchoolWhereInput[] = [
		{ OR: [{ viewerUserId: null }, { viewerUserId: actorId }] },
		...(viewTypes[input.view]
			? [{ event: { type: { in: viewTypes[input.view] ?? [] } } }]
			: []),
		...filterConditions(input.filters),
	];
	if (input.search)
		conditions.push({
			OR: [
				{
					actorDisplayName: {
						contains: input.search,
						mode: 'insensitive',
					},
				},
				{
					targetDisplayName: {
						contains: input.search,
						mode: 'insensitive',
					},
				},
				{
					event: {
						operationLabelSnapshot: {
							contains: input.search,
							mode: 'insensitive',
						},
					},
				},
				{
					event: {
						type: { contains: input.search, mode: 'insensitive' },
					},
				},
			],
		});
	if (cursor) {
		const compare = cursor.direction === 'older' ? 'lt' : 'gt';
		conditions.push({
			OR: [
				{ occurredAt: { [compare]: new Date(cursor.occurredAt) } },
				{
					occurredAt: new Date(cursor.occurredAt),
					eventId: { [compare]: cursor.eventId },
				},
			],
		});
	}
	const isNewer = cursor?.direction === 'newer';
	const rows = await prisma.securityEventSchool.findMany({
		where: { schoolId: input.schoolId, AND: conditions },
		include: { event: true },
		orderBy: [
			{ occurredAt: isNewer ? 'asc' : 'desc' },
			{ eventId: isNewer ? 'asc' : 'desc' },
		],
		take: input.limit + 1,
	});
	const hasOverflow = rows.length > input.limit;
	const page = rows.slice(0, input.limit);
	if (isNewer) page.reverse();
	const first = page[0];
	const last = page[page.length - 1];
	const make = (row: typeof first, direction: 'older' | 'newer') =>
		row
			? encodeCursor({
					actorId,
					schoolId: input.schoolId,
					fingerprint: fingerprint(input),
					direction,
					occurredAt: row.occurredAt.toISOString(),
					eventId: row.eventId,
					expiresAt: Date.now() + 15 * 60_000,
				})
			: null;
	return {
		items: page.map(rowDto),
		pageInfo: {
			nextCursor: isNewer
				? cursor
					? make(last, 'older')
					: null
				: hasOverflow
					? make(last, 'older')
					: null,
			previousCursor: isNewer
				? hasOverflow
					? make(first, 'newer')
					: null
				: cursor
					? make(first, 'newer')
					: null,
			hasNextPage: isNewer ? Boolean(cursor) : hasOverflow,
			hasPreviousPage: isNewer ? hasOverflow : Boolean(cursor),
		},
		collectionStatus: await getSecurityCollectionStatus(),
	};
}

export async function getManagerSecurityLog(
	actorId: string,
	schoolId: string,
	eventId: string,
) {
	await assertSchool(actorId, schoolId);
	const row = await prisma.securityEventSchool.findFirst({
		where: {
			schoolId,
			eventId,
			OR: [{ viewerUserId: null }, { viewerUserId: actorId }],
		},
		include: { event: true },
	});
	if (!row) throw AppError.notFound('Nie znaleziono zdarzenia');
	return {
		...rowDto(row),
		userAgent: row.event.userAgent,
		ipSource: row.event.ipSource,
		resourceType: row.event.resourceType,
		resourceId: row.event.resourceId,
		metadata: row.event.metadata,
	};
}

export async function listManagerSecurityLogFilterOptions(
	actorId: string,
	input: {
		schoolId: string;
		kind: 'actor' | 'target';
		search: string;
		limit: number;
		cursor?: string;
	},
) {
	await assertSchool(actorId, input.schoolId);
	const field = input.kind === 'actor' ? 'actorUserId' : 'targetUserId';
	const label =
		input.kind === 'actor' ? 'actorDisplayName' : 'targetDisplayName';
	const offset = input.cursor ? Number.parseInt(input.cursor, 10) : 0;
	if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000)
		throw AppError.badRequest('Nieprawidłowy kursor opcji');
	const rows = await prisma.securityEventSchool.findMany({
		where: {
			schoolId: input.schoolId,
			OR: [{ viewerUserId: null }, { viewerUserId: actorId }],
			[field]: { not: null },
			...(input.search
				? { [label]: { contains: input.search, mode: 'insensitive' } }
				: {}),
		},
		select: { [field]: true, [label]: true },
		distinct: [field],
		orderBy: [{ [label]: 'asc' }, { [field]: 'asc' }],
		skip: offset,
		take: input.limit + 1,
	});
	const page = rows.slice(0, input.limit);
	return {
		items: page.map((row) => ({
			userId: row[field] as string,
			displayName: row[label] as string | null,
		})),
		nextCursor:
			rows.length > input.limit ? String(offset + input.limit) : null,
	};
}
