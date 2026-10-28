import { Prisma, Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
const prisma = getPrisma();
type Tx = Prisma.TransactionClient;
export { prisma as accountDatabase };

export function accountWhere(
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

export async function assertManagerOwnsSchool(
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

export async function scopedAccount(
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

export async function lockAccount(tx: Tx, userId: string) {
	await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
}

export async function requireAvailable(
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
