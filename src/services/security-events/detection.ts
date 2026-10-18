import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { getPrisma } from '../../lib/prisma';

const prisma = getPrisma();
const WINDOW_MS = 10 * 60_000;

type LockedState = {
	rule: string;
	scope_key: string;
	subject_key: string;
	key_version: string;
	queued_generation: number;
	done_generation: number;
	last_processed_at: Date | null;
	last_processed_event_id: string | null;
	next_eligible_at: Date | null;
};

function parseScope(
	value: string,
): { schoolId: string; viewerUserId: string | null } | null {
	const matched = /^school:([0-9a-f-]{36}):(all|[0-9a-f-]{36})$/i.exec(value);
	return matched
		? {
				schoolId: matched[1],
				viewerUserId: matched[2] === 'all' ? null : matched[2],
			}
		: null;
}

function subjectWhere(state: LockedState): Prisma.SecurityEventWhereInput {
	if (state.rule === 'IP')
		return {
			clientIp: state.subject_key,
			ipSource: { in: ['SOCKET', 'TRUSTED_PROXY'] },
		};
	if (state.subject_key.startsWith('user:'))
		return { targetUserId: state.subject_key.slice(5) };
	if (state.subject_key.startsWith('hash:'))
		return { loginIdentifierHash: state.subject_key.slice(5) };
	return { id: '00000000-0000-0000-0000-000000000000' };
}

/** One short, row-locked transaction. A different instance skips the locked state. */
async function processOne(): Promise<boolean> {
	return prisma.$transaction(
		async (tx) => {
			const [state] = await tx.$queryRaw<LockedState[]>`
			SELECT rule, scope_key, subject_key, key_version, queued_generation,
			       done_generation, last_processed_at, last_processed_event_id, next_eligible_at
			FROM security_detection_states
			WHERE done_generation < queued_generation
			ORDER BY last_active_at ASC
			FOR UPDATE SKIP LOCKED
			LIMIT 1`;
			if (!state) return false;
			const scope = parseScope(state.scope_key);
			const globalScope = state.scope_key === 'GLOBAL';
			const key = {
				rule: state.rule,
				scopeKey: state.scope_key,
				subjectKey: state.subject_key,
				keyVersion: state.key_version,
			};
			if (!scope && !globalScope) {
				await tx.securityDetectionState.update({
					where: { rule_scopeKey_subjectKey_keyVersion: key },
					data: { doneGeneration: state.queued_generation },
				});
				return true;
			}
			const schoolWhere: Prisma.SecurityEventWhereInput = scope
				? {
						schools: {
							some: {
								schoolId: scope.schoolId,
								viewerUserId: scope.viewerUserId,
							},
						},
					}
				: {};
			const position: Prisma.SecurityEventWhereInput =
				state.last_processed_at && state.last_processed_event_id
					? {
							OR: [
								{ occurredAt: { gt: state.last_processed_at } },
								{
									occurredAt: state.last_processed_at,
									id: { gt: state.last_processed_event_id },
								},
							],
						}
					: {};
			const candidates = await tx.securityEvent.findMany({
				where: {
					type: 'LOGIN_FAILED',
					...subjectWhere(state),
					...position,
					...schoolWhere,
				},
				orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
				take: 21,
			});
			const hasMore = candidates.length > 20;
			const batch = candidates.slice(0, 20);
			let nextEligibleAt = state.next_eligible_at;
			const threshold = state.rule === 'IP' ? 20 : 5;
			for (const source of batch) {
				if (nextEligibleAt && source.occurredAt < nextEligibleAt)
					continue;
				const windowStart = new Date(
					source.occurredAt.getTime() - WINDOW_MS,
				);
				const attemptCount = await tx.securityEvent.count({
					where: {
						type: 'LOGIN_FAILED',
						...subjectWhere(state),
						OR: [
							{
								occurredAt: {
									gt: windowStart,
									lt: source.occurredAt,
								},
							},
							{
								occurredAt: source.occurredAt,
								id: { lte: source.id },
							},
						],
						...schoolWhere,
					},
				});
				if (attemptCount < threshold) continue;
				const projection = scope
					? await tx.securityEventSchool.findUnique({
							where: {
								eventId_schoolId: {
									eventId: source.id,
									schoolId: scope.schoolId,
								},
							},
							select: {
								targetUserId: true,
								targetDisplayName: true,
							},
						})
					: null;
				const alertId = randomUUID();
				const attemptId = createHash('sha256')
					.update(
						`${state.rule}:${state.scope_key}:${state.subject_key}:${source.id}`,
					)
					.digest('hex');
				await tx.securityEvent.create({
					data: {
						id: alertId,
						occurredAt: source.occurredAt,
						type: 'REPEATED_LOGIN_FAILURES',
						category: 'DETECTION',
						severity: 'HIGH',
						outcome: 'DETECTED',
						reasonCode:
							state.rule === 'IP'
								? 'IP_THRESHOLD'
								: 'ACCOUNT_THRESHOLD',
						operationCode: 'auth.login',
						operationLabelSnapshot:
							'Wielokrotne nieudane logowania',
						targetUserId:
							state.rule === 'ACCOUNT'
								? projection?.targetUserId
								: null,
						targetDisplayNameSnapshot:
							state.rule === 'ACCOUNT'
								? projection?.targetDisplayName
								: null,
						clientIp:
							state.rule === 'IP' ? state.subject_key : null,
						source: 'DETECTOR',
						attemptId,
						eventPhase: 'THRESHOLD',
						sourceEventId: source.id,
						metadata: { attemptCount, windowMinutes: 10 },
						...(scope
							? {
									schools: {
										create: {
											schoolId: scope.schoolId,
											occurredAt: source.occurredAt,
											viewerUserId: scope.viewerUserId,
											actorVisibility: 'UNKNOWN',
											targetUserId:
												state.rule === 'ACCOUNT'
													? projection?.targetUserId
													: null,
											targetDisplayName:
												state.rule === 'ACCOUNT'
													? projection?.targetDisplayName
													: null,
										},
									},
								}
							: {}),
					},
				});
				nextEligibleAt = new Date(
					source.occurredAt.getTime() + WINDOW_MS,
				);
			}
			const last = batch[batch.length - 1];
			await tx.securityDetectionState.update({
				where: { rule_scopeKey_subjectKey_keyVersion: key },
				data: {
					lastProcessedAt:
						last?.occurredAt ?? state.last_processed_at,
					lastProcessedEventId:
						last?.id ?? state.last_processed_event_id,
					nextEligibleAt,
					...(!hasMore
						? { doneGeneration: state.queued_generation }
						: {}),
				},
			});
			return true;
		},
		{ timeout: 10000, maxWait: 1000 },
	);
}

export async function processSecurityDetectionQueue(
	maxStates = 20,
): Promise<number> {
	let processed = 0;
	while (processed < maxStates && (await processOne())) processed++;
	return processed;
}
