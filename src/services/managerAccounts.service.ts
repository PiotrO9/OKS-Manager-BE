import { Prisma, Role } from '@prisma/client';
import { AppError } from '../lib/http/AppError';
import { logger } from '../lib/logger';
import { getPrisma } from '../lib/prisma';
import { getSupabaseClient } from '../lib/supabase';
import { passwordResetRedirect } from '../lib/passwordResetRedirect';
import { getSupabaseAdminClient } from '../lib/supabaseAdmin';
import { recordSecurityEvent } from './security-events/record';
import type { SecurityEventType } from './security-events/types';
import { findManagerAccountObligations } from './managerAccountObligations.service';

const prisma = getPrisma();
type Tx = Prisma.TransactionClient;

async function recordAccountActionEvent(input: {
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

function accountWhere(
	schoolId: string,
	userId?: string,
): Prisma.UserWhereInput {
	return {
		...(userId ? { id: userId } : {}),
		OR: [
			{
				role: Role.STUDENT,
				studentProfile: { studentSchools: { some: { schoolId } } },
			},
			{
				role: Role.INSTRUCTOR,
				instructorProfile: {
					instructorSchools: { some: { schoolId } },
				},
			},
		],
	};
}

async function assertManagerOwnsSchool(
	db: Tx | typeof prisma,
	actorId: string,
	schoolId: string,
) {
	const school = await db.drivingSchool.findFirst({
		where: { id: schoolId, ownerId: actorId, deletedAt: null },
		select: { id: true },
	});
	if (!school) {
		const existing = await db.drivingSchool.findUnique({
			where: { id: schoolId },
			select: { id: true },
		});
		if (existing) {
			throw AppError.notFound(
				'Driving school not found',
			).withSecurityAudit({
				reasonCode: 'SCHOOL_ACCESS_DENIED',
				schoolId: existing.id,
				resourceType: 'DRIVING_SCHOOL',
				resourceId: existing.id,
			});
		}
		throw AppError.notFound('Driving school not found');
	}
}

async function resolveAccountSchool(
	db: Tx | typeof prisma,
	userId: string,
): Promise<string> {
	const target = await db.user.findUnique({
		where: { id: userId },
		select: {
			role: true,
			studentProfile: {
				select: {
					studentSchools: {
						where: { school: { deletedAt: null } },
						select: { schoolId: true },
					},
				},
			},
			instructorProfile: {
				select: {
					instructorSchools: {
						where: { school: { deletedAt: null } },
						select: { schoolId: true },
					},
				},
			},
		},
	});
	const links =
		target?.role === Role.STUDENT
			? target.studentProfile?.studentSchools
			: target?.role === Role.INSTRUCTOR
				? target.instructorProfile?.instructorSchools
				: undefined;
	if (!links?.length) throw AppError.notFound('Account not found');
	if (links.length !== 1)
		throw AppError.conflict(
			'Account is assigned to multiple active driving schools',
		);
	return links[0]!.schoolId;
}

async function scopedAccount(
	db: Tx | typeof prisma,
	actorId: string,
	schoolId: string | undefined,
	userId: string,
) {
	schoolId ??= await resolveAccountSchool(db, userId);
	await assertManagerOwnsSchool(db, actorId, schoolId);
	const account = await db.user.findFirst({
		where: accountWhere(schoolId, userId),
		select: {
			id: true,
			role: true,
			firstName: true,
			lastName: true,
			email: true,
			phone: true,
			isActive: true,
			deletedAt: true,
			studentProfile: { select: { id: true } },
			instructorProfile: { select: { id: true } },
			accountActionsFor: {
				where: {
					status: {
						in: ['PENDING', 'AUTH_UPDATED', 'REPAIR_REQUIRED'],
					},
				},
				select: { status: true },
			},
		},
	});
	if (!account) {
		const target = await db.user.findUnique({
			where: { id: userId },
			select: {
				id: true,
				firstName: true,
				lastName: true,
				studentProfile: {
					select: { studentSchools: { select: { schoolId: true } } },
				},
				instructorProfile: {
					select: {
						instructorSchools: { select: { schoolId: true } },
					},
				},
			},
		});
		const actualSchoolId =
			target?.studentProfile?.studentSchools[0]?.schoolId ??
			target?.instructorProfile?.instructorSchools[0]?.schoolId;
		if (target && actualSchoolId) {
			throw AppError.notFound('Account not found').withSecurityAudit({
				reasonCode: 'ACCOUNT_ACCESS_DENIED',
				schoolId: actualSchoolId,
				targetUserId: target.id,
				targetDisplayName:
					`${target.firstName} ${target.lastName}`.trim(),
				resourceType: 'ACCOUNT',
				resourceId: target.id,
			});
		}
		throw AppError.notFound('Account not found');
	}
	return { ...account, schoolId };
}

async function lockAccount(tx: Tx, userId: string) {
	await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
}

async function requireAvailable(
	tx: Tx,
	account: {
		id: string;
		deletedAt: Date | null;
		accountActionsFor: Array<{ status: string }>;
	},
) {
	if (account.deletedAt) throw AppError.conflict('Account is archived');
	if (account.accountActionsFor.length)
		throw AppError.conflict('Account change already in progress');
	const resetInProgress = await tx.accountAction.count({
		where: {
			targetId: account.id,
			action: 'PASSWORD_RESET_REQUEST',
			status: 'REQUESTING',
			createdAt: { gt: new Date(Date.now() - 5 * 60_000) },
		},
	});
	if (resetInProgress)
		throw AppError.conflict('Account change already in progress');
}

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

async function finishEmailAction(
	actionId: string,
	targetId: string,
	email: string,
) {
	await prisma.$transaction(async (tx) => {
		await lockAccount(tx, targetId);
		await tx.user.update({
			where: { id: targetId },
			data: { email, updatedAt: new Date() },
		});
		await tx.accountSession.updateMany({
			where: { userId: targetId, revokedAt: null },
			data: { revokedAt: new Date() },
		});
		await tx.accountAction.update({
			where: { id: actionId },
			data: { status: 'COMPLETED' },
		});
	});
}

export async function changeManagerAccountEmail(
	actorId: string,
	requestedSchoolId: string | undefined,
	userId: string,
	email: string,
	requestId?: string,
) {
	let schoolId = requestedSchoolId ?? '';
	const action = await prisma.$transaction(async (tx) => {
		await lockAccount(tx, userId);
		const account = await scopedAccount(
			tx,
			actorId,
			requestedSchoolId,
			userId,
		);
		schoolId = account.schoolId;
		await requireAvailable(tx, account);
		if (account.email.toLowerCase() === email.toLowerCase()) {
			throw AppError.conflict('Email is unchanged');
		}
		const pending = await tx.accountAction.count({
			where: {
				targetId: userId,
				status: { in: ['PENDING', 'AUTH_UPDATED', 'REPAIR_REQUIRED'] },
			},
		});
		if (pending)
			throw AppError.conflict('Account change already in progress');
		return tx.accountAction.create({
			data: {
				actorId,
				targetId: userId,
				schoolId,
				action: 'EMAIL_CHANGE',
				status: 'PENDING',
				oldValue: account.email,
				newValue: email,
				requestId,
			},
		});
	});
	await recordAccountActionEvent({
		actionId: action.id,
		type: 'ACCOUNT_EMAIL_CHANGE_REQUESTED',
		actorId,
		targetId: userId,
		schoolId,
		operationCode: 'MANAGER_ACCOUNT_EMAIL_UPDATE',
		operationLabel: 'Zmiana adresu e-mail konta',
		requestId,
	});
	const { data, error } =
		await getSupabaseAdminClient().auth.admin.updateUserById(userId, {
			email,
			email_confirm: true,
		});
	if (error || !data.user?.email) {
		await prisma.accountAction.update({
			where: { id: action.id },
			data: { status: 'FAILED' },
		});
		await recordAccountActionEvent({
			actionId: action.id,
			type: 'ACCOUNT_CHANGE_FAILED',
			actorId,
			targetId: userId,
			schoolId,
			operationCode: 'MANAGER_ACCOUNT_EMAIL_UPDATE',
			operationLabel: 'Zmiana adresu e-mail konta',
			requestId,
			reasonCode: 'AUTH_PROVIDER_UPDATE_FAILED',
		});
		throw AppError.badGateway('Email could not be changed in Auth');
	}
	await prisma.accountAction.update({
		where: { id: action.id },
		data: { status: 'AUTH_UPDATED' },
	});
	try {
		await finishEmailAction(action.id, userId, data.user.email);
	} catch {
		await prisma.accountAction.update({
			where: { id: action.id },
			data: { status: 'REPAIR_REQUIRED' },
		});
		await recordAccountActionEvent({
			actionId: action.id,
			type: 'ACCOUNT_CHANGE_REPAIR_REQUIRED',
			actorId,
			targetId: userId,
			schoolId,
			operationCode: 'MANAGER_ACCOUNT_EMAIL_UPDATE',
			operationLabel: 'Zmiana adresu e-mail konta',
			requestId,
			reasonCode: 'LOCAL_SYNCHRONIZATION_FAILED',
		});
		throw AppError.badGateway(
			'Email changed in Auth; account synchronization required',
		);
	}
	await recordAccountActionEvent({
		actionId: action.id,
		type: 'ACCOUNT_EMAIL_CHANGED',
		actorId,
		targetId: userId,
		schoolId,
		operationCode: 'MANAGER_ACCOUNT_EMAIL_UPDATE',
		operationLabel: 'Zmiana adresu e-mail konta',
		requestId,
	});
	return { id: userId, email: data.user.email };
}

export async function reconcileManagerAccountEmail(
	actorId: string,
	requestedSchoolId: string | undefined,
	userId: string,
) {
	const account = await scopedAccount(
		prisma,
		actorId,
		requestedSchoolId,
		userId,
	);
	const schoolId = account.schoolId;
	const action = await prisma.accountAction.findFirst({
		where: {
			targetId: userId,
			action: 'EMAIL_CHANGE',
			status: { in: ['PENDING', 'AUTH_UPDATED', 'REPAIR_REQUIRED'] },
		},
		orderBy: { createdAt: 'desc' },
	});
	if (!action?.newValue)
		throw AppError.notFound('No email change to reconcile');
	const { data, error } =
		await getSupabaseAdminClient().auth.admin.getUserById(userId);
	if (error || !data.user) throw AppError.badGateway('Auth user unavailable');
	if (data.user.email?.toLowerCase() !== action.newValue.toLowerCase()) {
		if (data.user.email?.toLowerCase() === action.oldValue?.toLowerCase()) {
			await prisma.accountAction.update({
				where: { id: action.id },
				data: { status: 'FAILED' },
			});
			await recordAccountActionEvent({
				actionId: action.id,
				type: 'ACCOUNT_CHANGE_FAILED',
				actorId,
				targetId: userId,
				schoolId,
				operationCode: 'MANAGER_ACCOUNT_EMAIL_UPDATE',
				operationLabel: 'Zmiana adresu e-mail konta',
				requestId: action.requestId ?? undefined,
				reasonCode: 'AUTH_EMAIL_UNCHANGED',
			});
			return { id: userId, status: 'FAILED' };
		}
		throw AppError.conflict('Auth email differs from expected value');
	}
	await finishEmailAction(action.id, userId, data.user.email);
	await recordAccountActionEvent({
		actionId: action.id,
		type: 'ACCOUNT_EMAIL_CHANGED',
		actorId,
		targetId: userId,
		schoolId,
		operationCode: 'MANAGER_ACCOUNT_EMAIL_UPDATE',
		operationLabel: 'Zmiana adresu e-mail konta',
		requestId: action.requestId ?? undefined,
	});
	return { id: userId, email: data.user.email, status: 'COMPLETED' };
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
