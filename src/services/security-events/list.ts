import { Prisma } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import { getSecurityCollectionStatus } from './health';
import type { ListInput } from './listTypes';
import { decodeCursor, encodeCursor, fingerprint } from './listCursor';
import { filterConditions } from './listFilters';

const prisma = getPrisma();
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

async function assertSchool(actorId: string, schoolId: string) {
	const school = await prisma.drivingSchool.findFirst({
		where: { id: schoolId, ownerId: actorId, deletedAt: null },
		select: { id: true },
	});
	if (!school) throw AppError.notFound('Nie znaleziono OSK');
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
