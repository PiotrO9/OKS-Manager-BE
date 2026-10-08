import { Prisma, Role } from '@prisma/client';
import { AppError } from '../lib/http/AppError';
import { getPrisma } from '../lib/prisma';
import { getSupabaseClient } from '../lib/supabase';
import { getSupabaseAdminClient } from '../lib/supabaseAdmin';

const prisma = getPrisma();
type Tx = Prisma.TransactionClient;

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
	if (!school) throw AppError.notFound('Driving school not found');
}

async function scopedAccount(
	db: Tx | typeof prisma,
	actorId: string,
	schoolId: string,
	userId: string,
) {
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
	if (!account) throw AppError.notFound('Account not found');
	return account;
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
	schoolId: string,
	userId: string,
) {
	return scopedAccount(prisma, actorId, schoolId, userId);
}

export async function updateManagerAccountProfile(
	actorId: string,
	schoolId: string,
	userId: string,
	data: { firstName: string; lastName: string; phone: string | null },
	requestId?: string,
) {
	return prisma.$transaction(async (tx) => {
		await lockAccount(tx, userId);
		const account = await scopedAccount(tx, actorId, schoolId, userId);
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
	schoolId: string,
	userId: string,
	isActive: boolean,
	requestId?: string,
) {
	return prisma.$transaction(async (tx) => {
		await lockAccount(tx, userId);
		const account = await scopedAccount(tx, actorId, schoolId, userId);
		await requireAvailable(tx, account);
		if (account.isActive === isActive) return account;
		const updated = await tx.user.update({
			where: { id: userId },
			data: { isActive, updatedAt: new Date() },
			select: { id: true, isActive: true },
		});
		await tx.accountSession.updateMany({
			where: { userId, revokedAt: null },
			data: { revokedAt: new Date() },
		});
		await tx.accountAction.create({
			data: {
				actorId,
				targetId: userId,
				schoolId,
				action: isActive ? 'UNBLOCK' : 'BLOCK',
				status: 'COMPLETED',
				requestId,
			},
		});
		return updated;
	});
}

async function assertNoActiveObligations(
	tx: Tx,
	userId: string,
	role: Role,
	schoolId: string,
) {
	const now = new Date();
	if (role === Role.STUDENT) {
		const profile = await tx.studentProfile.findUnique({
			where: { userId },
			select: { id: true },
		});
		if (!profile) throw AppError.notFound('Student profile not found');
		const [lessons, courses, events, pendingPayments] = await Promise.all([
			tx.lesson.count({
				where: {
					studentId: profile.id,
					startTime: { gte: now },
					deletedAt: null,
					course: { schoolId },
				},
			}),
			tx.courseParticipant.count({
				where: {
					student: { userId },
					status: 'ACTIVE',
					course: { schoolId, deletedAt: null },
				},
			}),
			tx.eventParticipant.count({
				where: {
					student: { userId },
					event: {
						schoolId,
						isActive: true,
						startTime: { gte: now },
					},
				},
			}),
			tx.payment.count({
				where: {
					status: 'PENDING',
					paymentPlan: {
						course: {
							schoolId,
							participants: { some: { studentId: profile.id } },
						},
					},
				},
			}),
		]);
		if (lessons || courses || events || pendingPayments)
			throw AppError.conflict('Student has active school obligations');
	} else {
		const profile = await tx.instructorProfile.findUnique({
			where: { userId },
			select: { id: true },
		});
		if (!profile) throw AppError.notFound('Instructor profile not found');
		const [lessons, courses, events, blocks] = await Promise.all([
			tx.lesson.count({
				where: {
					instructorId: profile.id,
					startTime: { gte: now },
					deletedAt: null,
					course: { schoolId },
				},
			}),
			tx.course.count({
				where: {
					instructor: { userId },
					schoolId,
					deletedAt: null,
					status: 'active',
				},
			}),
			tx.instructorEvent.count({
				where: {
					instructor: { userId },
					schoolId,
					isActive: true,
					startTime: { gte: now },
				},
			}),
			tx.instructorTimeBlock.count({
				where: {
					instructor: { userId },
					schoolId,
					startTime: { gte: now },
				},
			}),
		]);
		if (lessons || courses || events || blocks)
			throw AppError.conflict('Instructor has active school obligations');
	}
}

export async function archiveManagerAccount(
	actorId: string,
	schoolId: string,
	userId: string,
	requestId?: string,
) {
	return prisma.$transaction(async (tx) => {
		await lockAccount(tx, userId);
		const account = await scopedAccount(tx, actorId, schoolId, userId);
		if (account.deletedAt) return { id: userId, archived: true };
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
		await tx.accountSession.updateMany({
			where: { userId, revokedAt: null },
			data: { revokedAt: new Date() },
		});
		await tx.accountAction.create({
			data: {
				actorId,
				targetId: userId,
				schoolId,
				action: 'ARCHIVE',
				status: 'COMPLETED',
				requestId,
			},
		});
		return { id: userId, archived: true };
	});
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
	schoolId: string,
	userId: string,
	email: string,
	requestId?: string,
) {
	const action = await prisma.$transaction(async (tx) => {
		await lockAccount(tx, userId);
		const account = await scopedAccount(tx, actorId, schoolId, userId);
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
		throw AppError.badGateway(
			'Email changed in Auth; account synchronization required',
		);
	}
	return { id: userId, email: data.user.email };
}

export async function reconcileManagerAccountEmail(
	actorId: string,
	schoolId: string,
	userId: string,
) {
	await scopedAccount(prisma, actorId, schoolId, userId);
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
			return { id: userId, status: 'FAILED' };
		}
		throw AppError.conflict('Auth email differs from expected value');
	}
	await finishEmailAction(action.id, userId, data.user.email);
	return { id: userId, email: data.user.email, status: 'COMPLETED' };
}

export async function sendManagerAccountPasswordReset(
	actorId: string,
	schoolId: string,
	userId: string,
	requestId?: string,
) {
	const frontendUrl = process.env.FRONTEND_URL?.split(',')[0]?.trim();
	if (!frontendUrl)
		throw AppError.internal('FRONTEND_URL is required for password reset');
	const redirectTo = new URL('/reset-password', frontendUrl).toString();
	const { account, action } = await prisma.$transaction(async (tx) => {
		await lockAccount(tx, userId);
		const account = await scopedAccount(tx, actorId, schoolId, userId);
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
	if (error)
		throw AppError.badGateway('Password reset email could not be sent');
	return { sent: true };
}
