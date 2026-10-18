import { createHmac, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { Prisma } from '@prisma/client';
import { getPrisma } from '../../lib/prisma';
import {
	eventDefaults,
	type SecurityEventInput,
	type SecurityEventSchoolScope,
} from './types';

const prisma = getPrisma();
const clean = (value: string | undefined, max: number) =>
	value
		// eslint-disable-next-line no-control-regex
		?.replace(/[\u0000-\u001f\u007f]/g, ' ')
		.trim()
		.slice(0, max) || null;

function normalizeLogin(value: string): string {
	return value.trim().toLowerCase();
}

function loginHash(login: string): string | null {
	const key = process.env.SECURITY_EVENT_HMAC_KEY;
	if (!key || key.length < 32) return null;
	return createHmac('sha256', key)
		.update(normalizeLogin(login))
		.digest('hex');
}

function maskLogin(value: string): string {
	const login = normalizeLogin(value);
	const [local, domain] = login.split('@');
	if (!local || !domain) return '***';
	return `${local.slice(0, 1)}***@${domain.slice(0, 2)}***`;
}

function normalizeIp(value: string | undefined): string | null {
	if (!value) return null;
	const trimmed = value.trim();
	const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(trimmed);
	if (mapped && isIP(mapped[1]) === 4) return mapped[1];
	return isIP(trimmed) ? trimmed.toLowerCase() : null;
}

function safeScope(
	scope: SecurityEventSchoolScope,
	input: SecurityEventInput,
	occurredAt: Date,
) {
	const actorVisibility =
		scope.actorVisibility ??
		((scope.actorUserId ?? input.actorUserId) ? 'KNOWN' : 'UNKNOWN');
	return {
		schoolId: scope.schoolId,
		occurredAt,
		viewerUserId: scope.viewerUserId ?? null,
		actorVisibility,
		actorUserId:
			actorVisibility === 'KNOWN'
				? (scope.actorUserId ?? input.actorUserId ?? null)
				: null,
		actorDisplayName:
			actorVisibility === 'EXTERNAL'
				? 'Użytkownik zewnętrzny'
				: actorVisibility === 'KNOWN'
					? clean(
							scope.actorDisplayName ?? input.actorDisplayName,
							160,
						)
					: null,
		actorRole:
			actorVisibility === 'KNOWN'
				? clean(scope.actorRole ?? input.actorRole, 24)
				: null,
		targetUserId: scope.targetUserId ?? null,
		targetDisplayName: clean(scope.targetDisplayName, 160),
	};
}

function detectionKeys(
	input: SecurityEventInput,
	scopes: ReturnType<typeof safeScope>[],
	hash: string | null,
) {
	if (input.type !== 'LOGIN_FAILED') return [];
	const accountKey = input.targetUserId
		? `user:${input.targetUserId}`
		: hash
			? `hash:${hash}`
			: null;
	const ipKey = normalizeIp(input.clientIp);
	const keys: Array<{
		rule: string;
		scopeKey: string;
		subjectKey: string;
		keyVersion: string;
	}> = [];
	if (accountKey)
		keys.push({
			rule: 'ACCOUNT',
			scopeKey: 'GLOBAL',
			subjectKey: accountKey,
			keyVersion: input.targetUserId ? 'user' : 'v1',
		});
	if (ipKey && ['SOCKET', 'TRUSTED_PROXY'].includes(input.ipSource ?? ''))
		keys.push({
			rule: 'IP',
			scopeKey: 'GLOBAL',
			subjectKey: ipKey,
			keyVersion: 'ip',
		});
	for (const scope of scopes) {
		const scopeKey = `school:${scope.schoolId}:${scope.viewerUserId ?? 'all'}`;
		if (accountKey)
			keys.push({
				rule: 'ACCOUNT',
				scopeKey,
				subjectKey: accountKey,
				keyVersion: input.targetUserId ? 'user' : 'v1',
			});
		if (ipKey && ['SOCKET', 'TRUSTED_PROXY'].includes(input.ipSource ?? ''))
			keys.push({
				rule: 'IP',
				scopeKey,
				subjectKey: ipKey,
				keyVersion: 'ip',
			});
	}
	return keys;
}

export async function recordSecurityEvent(
	input: SecurityEventInput,
): Promise<{ id: string; created: boolean }> {
	const occurredAt = input.occurredAt ?? new Date();
	const defaults = eventDefaults(input.type);
	const hash = input.loginIdentifier
		? loginHash(input.loginIdentifier)
		: null;
	const scopes = [
		...new Map(
			(input.schoolScopes ?? []).map((s) => [
				s.schoolId,
				safeScope(s, input, occurredAt),
			]),
		).values(),
	];
	const keys = detectionKeys(input, scopes, hash);
	const id = randomUUID();
	const metadata = {
		...(Number.isSafeInteger(input.metadata?.attemptCount)
			? { attemptCount: input.metadata?.attemptCount }
			: {}),
		...(Number.isSafeInteger(input.metadata?.windowMinutes)
			? { windowMinutes: input.metadata?.windowMinutes }
			: {}),
	};
	try {
		await prisma.$transaction(
			async (tx) => {
				await tx.securityEvent.create({
					data: {
						id,
						occurredAt,
						type: input.type,
						category: input.category ?? defaults.category,
						severity: input.severity ?? defaults.severity,
						outcome: input.outcome ?? defaults.outcome,
						reasonCode: clean(input.reasonCode, 64),
						operationCode: clean(input.operationCode, 96),
						operationLabelSnapshot: clean(
							input.operationLabel,
							160,
						),
						httpMethod: clean(input.httpMethod, 8),
						routeTemplate: clean(input.routeTemplate, 180),
						httpStatus: input.httpStatus ?? null,
						actorUserId: input.actorUserId ?? null,
						actorRoleSnapshot: clean(input.actorRole, 24),
						actorDisplayNameSnapshot: clean(
							input.actorDisplayName,
							160,
						),
						targetUserId: input.targetUserId ?? null,
						targetDisplayNameSnapshot: clean(
							input.targetDisplayName,
							160,
						),
						resourceType: clean(input.resourceType, 48),
						resourceId: clean(input.resourceId, 100),
						loginIdentifierHash: hash,
						hashKeyVersion: hash
							? clean(
									process.env
										.SECURITY_EVENT_HMAC_KEY_VERSION ??
										'v1',
									24,
								)
							: null,
						loginIdentifierMasked: input.loginIdentifier
							? maskLogin(input.loginIdentifier)
							: null,
						clientIp: normalizeIp(input.clientIp),
						ipSource: clean(input.ipSource, 24),
						userAgent: clean(input.userAgent, 256),
						requestId: clean(input.requestId, 100),
						attemptId: clean(input.attemptId, 100) ?? id,
						eventPhase: clean(input.eventPhase, 48) ?? 'RESULT',
						source: clean(input.source, 32) ?? 'BE_HTTP',
						accountActionId: input.accountActionId ?? null,
						metadata,
						schools: { create: scopes },
					},
				});
				for (const key of keys) {
					await tx.securityDetectionState.upsert({
						where: { rule_scopeKey_subjectKey_keyVersion: key },
						create: {
							...key,
							queuedGeneration: 1,
							lastActiveAt: occurredAt,
						},
						update: {
							queuedGeneration: { increment: 1 },
							lastActiveAt: occurredAt,
						},
					});
				}
			},
			{ timeout: 3000, maxWait: 1000 },
		);
		return { id, created: true };
	} catch (error) {
		if (
			error instanceof Prisma.PrismaClientKnownRequestError &&
			error.code === 'P2002'
		) {
			const existing = await prisma.securityEvent.findFirst({
				where: {
					source: clean(input.source, 32) ?? 'BE_HTTP',
					attemptId: clean(input.attemptId, 100) ?? id,
					eventPhase: clean(input.eventPhase, 48) ?? 'RESULT',
				},
				select: { id: true },
			});
			if (existing) return { id: existing.id, created: false };
		}
		throw error;
	}
}

export async function resolveLoginTarget(email: string): Promise<{
	targetUserId?: string;
	targetDisplayName?: string;
	schoolScopes: SecurityEventSchoolScope[];
}> {
	const normalized = normalizeLogin(email);
	if (!normalized || normalized.length > 320) return { schoolScopes: [] };
	const user = await prisma.user.findFirst({
		where: { email: { equals: normalized, mode: 'insensitive' } },
		select: {
			id: true,
			firstName: true,
			lastName: true,
			role: true,
			drivingSchoolsOwned: {
				where: { deletedAt: null },
				select: { id: true },
			},
			studentProfile: {
				select: { studentSchools: { select: { schoolId: true } } },
			},
			instructorProfile: {
				select: { instructorSchools: { select: { schoolId: true } } },
			},
		},
	});
	if (!user) return { schoolScopes: [] };
	const targetDisplayName = `${user.firstName} ${user.lastName}`.trim();
	const schoolIds =
		user.role === 'MANAGER'
			? user.drivingSchoolsOwned.map((s) => s.id)
			: user.role === 'STUDENT'
				? (user.studentProfile?.studentSchools.map((s) => s.schoolId) ??
					[])
				: user.role === 'INSTRUCTOR'
					? (user.instructorProfile?.instructorSchools.map(
							(s) => s.schoolId,
						) ?? [])
					: [];
	return {
		targetUserId: user.id,
		targetDisplayName,
		schoolScopes: schoolIds.map((schoolId) => ({
			schoolId,
			targetUserId: user.id,
			targetDisplayName,
			actorVisibility: 'UNKNOWN',
			viewerUserId: user.role === 'MANAGER' ? user.id : null,
		})),
	};
}
