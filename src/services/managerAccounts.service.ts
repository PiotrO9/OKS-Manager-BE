import {
	accountDatabase as prisma,
	accountWhere,
	assertManagerOwnsSchool,
	scopedAccount,
	lockAccount,
	requireAvailable,
} from './manager-accounts/access';
import { recordAccountActionEvent } from './manager-accounts/securityAudit';
export {
	changeManagerAccountEmail,
	reconcileManagerAccountEmail,
} from './manager-accounts/emailChange';
import { Prisma, Role } from '@prisma/client';
import { AppError } from '../lib/http/AppError';
import { getSupabaseClient } from '../lib/supabase';
import { passwordResetRedirect } from '../lib/passwordResetRedirect';
import { findManagerAccountObligations } from './managerAccountObligations.service';
import type { ManagerAccountsQuery } from '../lib/validation/managerAccountSchemas';

type Tx = Prisma.TransactionClient;

export async function searchManagerAccounts(
	actorId: string,
	query: ManagerAccountsQuery & { page: number },
) {
	await assertManagerOwnsSchool(prisma, actorId, query.schoolId);
	const AND: Prisma.UserWhereInput[] = [accountWhere(query.schoolId)];
	if (query.role) AND.push({ role: query.role });
	if (query.profileId)
		AND.push({ instructorProfile: { id: query.profileId } });
	for (const term of query.search?.split(/\s+/).filter(Boolean) ?? []) {
		// Prisma contains uses LIKE patterns; user input must remain literal.
		const contains = term.replace(/[\\%_]/g, '\\$&');
		AND.push({
			OR: ['firstName', 'lastName', 'email'].map((field) => ({
				[field]: { contains, mode: 'insensitive' },
			})),
		});
	}
	const where: Prisma.UserWhereInput = { AND };
	return prisma.$transaction(
		async (tx) => {
			const [items, total] = await Promise.all([
				tx.user.findMany({
					where,
					select: {
						id: true,
						role: true,
						firstName: true,
						lastName: true,
						email: true,
						isActive: true,
						deletedAt: true,
					},
					orderBy: [
						{ lastName: 'asc' },
						{ firstName: 'asc' },
						{ id: 'asc' },
					],
					skip: (query.page - 1) * query.limit,
					take: query.limit,
				}),
				tx.user.count({ where }),
			]);
			return { items, total, page: query.page, limit: query.limit };
		},
		{ isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
	);
}

// Temporary compatibility for clients deployed before server pagination.
export async function listManagerAccounts(actorId: string, schoolId: string) {
	await assertManagerOwnsSchool(prisma, actorId, schoolId);
	return prisma.user.findMany({
		where: accountWhere(schoolId),
		select: {
			id: true,
			role: true,
			firstName: true,
			lastName: true,
			email: true,
			phone: true,
			isActive: true,
			deletedAt: true,
			accountActionsFor: {
				where: {
					status: {
						in: ['PENDING', 'AUTH_UPDATED', 'REPAIR_REQUIRED'],
					},
				},
				select: { status: true },
			},
			studentProfile: { select: { id: true } },
			instructorProfile: { select: { id: true } },
		},
		orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
	});
}

export async function getManagerAccount(
	actorId: string,
	requestedSchoolId: string | undefined,
	userId: string,
) {
	return scopedAccount(prisma, actorId, requestedSchoolId, userId);
}

export async function updateManagerAccountProfile(
	actorId: string,
	requestedSchoolId: string | undefined,
	userId: string,
	data: { firstName: string; lastName: string; phone: string | null },
	requestId?: string,
) {
	let schoolId = requestedSchoolId ?? '';
	return prisma.$transaction(async (tx) => {
		await lockAccount(tx, userId);
		const account = await scopedAccount(
			tx,
			actorId,
			requestedSchoolId,
			userId,
		);
		schoolId = account.schoolId;
		await requireAvailable(tx, account);
		const updated = await tx.user.update({
			where: { id: userId },
			data: { ...data, updatedAt: new Date() },
			select: {
				id: true,
				firstName: true,
				lastName: true,
				phone: true,
			},
		});
		await tx.accountAction.create({
			data: {
				actorId,
				targetId: userId,
				schoolId,
				action: 'PROFILE_UPDATE',
				status: 'COMPLETED',
				requestId,
			},
		});
		return updated;
	});
}

export async function setManagerAccountActive(
	actorId: string,
	requestedSchoolId: string | undefined,
	userId: string,
	isActive: boolean,
	requestId?: string,
) {
	let schoolId = requestedSchoolId ?? '';
	const outcome = await prisma.$transaction(async (tx) => {
		await lockAccount(tx, userId);
		const account = await scopedAccount(
			tx,
			actorId,
			requestedSchoolId,
			userId,
		);
		schoolId = account.schoolId;
		await requireAvailable(tx, account);
		if (account.isActive === isActive)
			return {
				result: account,
				actionId: null,
				targetDisplayName: '',
				revokedCount: 0,
			};
		const updated = await tx.user.update({
			where: { id: userId },
			data: { isActive, updatedAt: new Date() },
			select: { id: true, isActive: true },
		});
		const revoked = await tx.accountSession.updateMany({
			where: { userId, revokedAt: null },
			data: { revokedAt: new Date() },
		});
		const action = await tx.accountAction.create({
			data: {
				actorId,
				targetId: userId,
				schoolId,
				action: isActive ? 'UNBLOCK' : 'BLOCK',
				status: 'COMPLETED',
				requestId,
			},
		});
		return {
			result: updated,
			actionId: action.id,
			targetDisplayName:
				`${account.firstName} ${account.lastName}`.trim(),
			revokedCount: revoked.count,
		};
	});
	if (outcome.actionId) {
		await recordAccountActionEvent({
			actionId: outcome.actionId,
			type: isActive ? 'ACCOUNT_UNBLOCKED' : 'ACCOUNT_BLOCKED',
			actorId,
			targetId: userId,
			targetDisplayName: outcome.targetDisplayName,
			schoolId,
			operationCode: 'MANAGER_ACCOUNT_STATUS_UPDATE',
			operationLabel: 'Zmiana aktywności konta',
			requestId,
		});
		if (outcome.revokedCount > 0) {
			await recordAccountActionEvent({
				actionId: outcome.actionId,
				type: 'SESSION_REVOKED',
				actorId,
				targetId: userId,
				targetDisplayName: outcome.targetDisplayName,
				schoolId,
				operationCode: 'MANAGER_ACCOUNT_STATUS_UPDATE',
				operationLabel: 'Zmiana aktywności konta',
				requestId,
				reasonCode: 'ACCOUNT_STATUS_CHANGED',
			});
		}
	}
	return outcome.result;
}

async function assertNoActiveObligations(
	tx: Tx,
	userId: string,
	role: Role,
	schoolId: string,
) {
	const obligations = await findManagerAccountObligations(
		tx,
		userId,
		role,
		schoolId,
	);
	if (obligations.length) {
		throw AppError.conflict(
			role === Role.STUDENT
				? 'Student has active school obligations'
				: 'Instructor has active school obligations',
		).withCode('ACCOUNT_ARCHIVE_OBLIGATIONS');
	}
}

export async function listManagerAccountObligations(
	actorId: string,
	requestedSchoolId: string | undefined,
	userId: string,
) {
	let schoolId = requestedSchoolId ?? '';
	return prisma.$transaction(async (tx) => {
		const account = await scopedAccount(
			tx,
			actorId,
			requestedSchoolId,
			userId,
		);
		schoolId = account.schoolId;
		if (account.deletedAt) return [];
		return findManagerAccountObligations(
			tx,
			userId,
			account.role,
			schoolId,
		);
	});
}

export async function archiveManagerAccount(
	actorId: string,
	requestedSchoolId: string | undefined,
	userId: string,
	requestId?: string,
) {
	let schoolId = requestedSchoolId ?? '';
	const outcome = await prisma.$transaction(async (tx) => {
		await lockAccount(tx, userId);
		const account = await scopedAccount(
			tx,
			actorId,
			requestedSchoolId,
			userId,
		);
		schoolId = account.schoolId;
		if (account.deletedAt)
			return {
				result: { id: userId, archived: true },
				actionId: null,
				targetDisplayName: '',
				revokedCount: 0,
			};
		await requireAvailable(tx, account);
		await assertNoActiveObligations(tx, userId, account.role, schoolId);
		await tx.user.update({
			where: { id: userId },
			data: {
				isActive: false,
				deletedAt: new Date(),
				updatedAt: new Date(),
			},
		});
		const revoked = await tx.accountSession.updateMany({
			where: { userId, revokedAt: null },
			data: { revokedAt: new Date() },
		});
		const action = await tx.accountAction.create({
			data: {
				actorId,
				targetId: userId,
				schoolId,
				action: 'ARCHIVE',
				status: 'COMPLETED',
				requestId,
			},
		});
		return {
			result: { id: userId, archived: true },
			actionId: action.id,
			targetDisplayName:
				`${account.firstName} ${account.lastName}`.trim(),
			revokedCount: revoked.count,
		};
	});
	if (outcome.actionId) {
		await recordAccountActionEvent({
			actionId: outcome.actionId,
			type: 'ACCOUNT_ARCHIVED',
			actorId,
			targetId: userId,
			targetDisplayName: outcome.targetDisplayName,
			schoolId,
			operationCode: 'MANAGER_ACCOUNT_ARCHIVE',
			operationLabel: 'Archiwizacja konta',
			requestId,
		});
		if (outcome.revokedCount > 0) {
			await recordAccountActionEvent({
				actionId: outcome.actionId,
				type: 'SESSION_REVOKED',
				actorId,
				targetId: userId,
				targetDisplayName: outcome.targetDisplayName,
				schoolId,
				operationCode: 'MANAGER_ACCOUNT_ARCHIVE',
				operationLabel: 'Archiwizacja konta',
				requestId,
				reasonCode: 'ACCOUNT_ARCHIVED',
			});
		}
	}
	return outcome.result;
}

export async function sendManagerAccountPasswordReset(
	actorId: string,
	requestedSchoolId: string | undefined,
	userId: string,
	requestId?: string,
) {
	let schoolId = requestedSchoolId ?? '';
	const redirectTo = passwordResetRedirect();
	const { account, action } = await prisma.$transaction(async (tx) => {
		await lockAccount(tx, userId);
		const account = await scopedAccount(
			tx,
			actorId,
			requestedSchoolId,
			userId,
		);
		schoolId = account.schoolId;
		await requireAvailable(tx, account);
		if (!account.isActive) throw AppError.conflict('Account is disabled');
		const action = await tx.accountAction.create({
			data: {
				actorId,
				targetId: userId,
				schoolId,
				action: 'PASSWORD_RESET_REQUEST',
				status: 'REQUESTING',
				requestId,
			},
		});
		return { account, action };
	});
	let error: unknown;
	try {
		const result = await getSupabaseClient().auth.resetPasswordForEmail(
			account.email,
			{ redirectTo },
		);
		error = result.error;
	} catch (cause) {
		error = cause;
	}
	await prisma.accountAction.update({
		where: { id: action.id },
		data: { status: error ? 'FAILED' : 'COMPLETED' },
	});
	await recordAccountActionEvent({
		actionId: action.id,
		type: error ? 'PASSWORD_RESET_FAILED' : 'PASSWORD_RESET_REQUESTED',
		actorId,
		targetId: userId,
		targetDisplayName: `${account.firstName} ${account.lastName}`.trim(),
		schoolId,
		operationCode: 'MANAGER_ACCOUNT_PASSWORD_RESET',
		operationLabel: 'Zlecenie resetu hasła',
		requestId,
		reasonCode: error ? 'AUTH_PROVIDER_REQUEST_FAILED' : undefined,
	});
	if (error)
		throw AppError.badGateway('Password reset email could not be sent');
	return { sent: true };
}
