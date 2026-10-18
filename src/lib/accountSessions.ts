import { decodeJwt } from 'jose';
import { getPrisma } from './prisma';

const prisma = getPrisma();

export function sessionIdFromToken(token: string): string | null {
	try {
		const claim = decodeJwt(token).session_id;
		return typeof claim === 'string' &&
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
				claim,
			)
			? claim
			: null;
	} catch {
		return null;
	}
}

export async function isAccountSessionAllowed(
	userId: string,
	sessionId: string | null,
): Promise<boolean> {
	return (await getAccountSessionDecision(userId, sessionId)).allowed;
}

export type AccountSessionDecision =
	| { allowed: true; reason: 'ALLOWED' }
	| {
			allowed: false;
			reason:
				| 'MISSING_SESSION_ID'
				| 'UNKNOWN_SESSION'
				| 'SESSION_USER_MISMATCH'
				| 'REVOKED_SESSION'
				| 'ACCOUNT_CHANGE_PENDING';
	  };

export async function getAccountSessionDecision(
	userId: string,
	sessionId: string | null,
): Promise<AccountSessionDecision> {
	if (!sessionId) return { allowed: false, reason: 'MISSING_SESSION_ID' };
	const session = await prisma.accountSession.findUnique({
		where: { sessionId },
	});
	if (!session) return { allowed: false, reason: 'UNKNOWN_SESSION' };
	if (session.userId !== userId)
		return { allowed: false, reason: 'SESSION_USER_MISMATCH' };
	if (session.revokedAt !== null)
		return { allowed: false, reason: 'REVOKED_SESSION' };
	const pending = await prisma.accountAction.count({
		where: {
			targetId: userId,
			status: { in: ['PENDING', 'AUTH_UPDATED', 'REPAIR_REQUIRED'] },
		},
	});
	return pending === 0
		? { allowed: true, reason: 'ALLOWED' }
		: { allowed: false, reason: 'ACCOUNT_CHANGE_PENDING' };
}

export async function registerAccountSession(
	userId: string,
	accessToken: string,
): Promise<boolean> {
	const sessionId = sessionIdFromToken(accessToken);
	if (!sessionId) return false;

	return prisma.$transaction(async (tx) => {
		await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
		const user = await tx.user.findUnique({
			where: { id: userId },
			select: { isActive: true, deletedAt: true },
		});
		if (!user?.isActive || user.deletedAt) return false;
		const pending = await tx.accountAction.count({
			where: {
				targetId: userId,
				status: { in: ['PENDING', 'AUTH_UPDATED', 'REPAIR_REQUIRED'] },
			},
		});
		if (pending > 0) return false;
		await tx.accountSession.create({ data: { userId, sessionId } });
		return true;
	});
}

export async function revokeAccountSessions(userId: string): Promise<void> {
	await prisma.accountSession.updateMany({
		where: { userId, revokedAt: null },
		data: { revokedAt: new Date() },
	});
}
