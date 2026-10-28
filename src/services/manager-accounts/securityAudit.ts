import { logger } from '../../lib/logger';
import { recordSecurityEvent } from '../security-events/record';
import type { SecurityEventType } from '../security-events/types';
import { accountDatabase as prisma } from './access';

export async function recordAccountActionEvent(input: {
	actionId: string;
	type: SecurityEventType;
	actorId: string;
	targetId: string;
	targetDisplayName?: string;
	schoolId: string;
	operationCode: string;
	operationLabel: string;
	requestId?: string;
	reasonCode?: string;
}) {
	try {
		const [actor, target] = await Promise.all([
			prisma.user.findUnique({
				where: { id: input.actorId },
				select: { firstName: true, lastName: true },
			}),
			prisma.user.findUnique({
				where: { id: input.targetId },
				select: { firstName: true, lastName: true },
			}),
		]);
		const actorDisplayName = actor
			? `${actor.firstName} ${actor.lastName}`.trim()
			: undefined;
		const targetDisplayName =
			input.targetDisplayName ??
			(target
				? `${target.firstName} ${target.lastName}`.trim()
				: undefined);
		await recordSecurityEvent({
			type: input.type,
			source: 'ACCOUNT_ACTION',
			attemptId: input.actionId,
			eventPhase: input.type,
			accountActionId: input.actionId,
			actorUserId: input.actorId,
			actorRole: 'MANAGER',
			actorDisplayName,
			targetUserId: input.targetId,
			targetDisplayName,
			operationCode: input.operationCode,
			operationLabel: input.operationLabel,
			requestId: input.requestId,
			reasonCode: input.reasonCode,
			schoolScopes: [
				{
					schoolId: input.schoolId,
					actorVisibility: 'KNOWN',
					actorUserId: input.actorId,
					actorRole: 'MANAGER',
					actorDisplayName,
					targetUserId: input.targetId,
					targetDisplayName,
				},
			],
		});
	} catch (error) {
		logger.error('Account action security event could not be recorded', {
			actionId: input.actionId,
			type: input.type,
			error,
		});
	}
}
