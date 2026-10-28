import { AppError } from '../../lib/http/AppError';
import { getSupabaseAdminClient } from '../../lib/supabaseAdmin';
import {
	accountDatabase as prisma,
	scopedAccount,
	lockAccount,
	requireAvailable,
} from './access';
import { recordAccountActionEvent } from './securityAudit';

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
