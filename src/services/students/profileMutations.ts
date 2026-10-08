import { Prisma, Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import {
	assertActorCanAssignStudentToSchoolForAdminOrManager,
	attachStudentToSchoolReplaceInTx,
} from '../../lib/studentSchoolRegistration';
import { assertActorCanPatchStudentPkk } from './access';
import { loadActiveStudentProfileId } from './activeStudent';
import type {
	AssignStudentDrivingSchoolResult,
	PatchStudentPkkResult,
	PatchStudentResult,
} from './types';

const prisma = getPrisma();

export async function assignStudentDrivingSchoolForAdminOrManager(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	schoolId: string,
): Promise<AssignStudentDrivingSchoolResult> {
	if (actorRole !== Role.ADMIN && actorRole !== Role.MANAGER) {
		throw AppError.forbidden('Forbidden');
	}

	const studentProfileId = await loadActiveStudentProfileId(studentUserId);

	await prisma.$transaction(async (tx) => {
		await tx.$queryRaw`SELECT id FROM users WHERE id = ${studentUserId}::uuid FOR UPDATE`;
		const pendingAccountChange = await tx.accountAction.count({
			where: {
				targetId: studentUserId,
				OR: [
					{
						status: {
							in: ['PENDING', 'AUTH_UPDATED', 'REPAIR_REQUIRED'],
						},
					},
					{
						action: 'PASSWORD_RESET_REQUEST',
						status: 'REQUESTING',
						createdAt: { gt: new Date(Date.now() - 5 * 60_000) },
					},
				],
			},
		});
		if (pendingAccountChange) {
			throw AppError.conflict('Account change already in progress');
		}
		await tx.$queryRaw`SELECT id FROM student_profiles WHERE id = ${studentProfileId}::uuid FOR UPDATE`;
		await assertActorCanAssignStudentToSchoolForAdminOrManager(
			tx,
			actorRole,
			actorId,
			schoolId,
		);
		if (actorRole === Role.MANAGER) {
			const currentLink = await tx.studentSchool.findFirst({
				where: {
					student: { userId: studentUserId },
					school: { ownerId: actorId, deletedAt: null },
				},
				select: { id: true },
			});
			if (!currentLink) throw AppError.notFound('Student not found');
		}
		await attachStudentToSchoolReplaceInTx(tx, studentUserId, schoolId);
	});

	const drivingSchool = await prisma.drivingSchool.findUnique({
		where: { id: schoolId },
		select: {
			id: true,
			name: true,
			city: true,
			address: true,
		},
	});
	if (!drivingSchool) {
		throw AppError.notFound('Driving school not found');
	}

	return {
		userId: studentUserId,
		drivingSchool,
	};
}

export async function patchStudentPkkForStaff(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	pkkNumber: string | null,
): Promise<PatchStudentPkkResult> {
	await loadActiveStudentProfileId(studentUserId);

	await assertActorCanPatchStudentPkk(actorId, actorRole, studentUserId);

	try {
		await prisma.studentProfile.update({
			where: { userId: studentUserId },
			data: { pkkNumber },
		});
	} catch (err) {
		if (
			err instanceof Prisma.PrismaClientKnownRequestError &&
			err.code === 'P2002'
		) {
			throw AppError.conflict('PKK number already in use');
		}
		throw err;
	}

	return { userId: studentUserId, pkkNumber };
}

export async function patchStudentForStaff(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	data: { notes: string | null },
): Promise<PatchStudentResult> {
	await loadActiveStudentProfileId(studentUserId);

	await assertActorCanPatchStudentPkk(actorId, actorRole, studentUserId);

	const updated = await prisma.studentProfile.update({
		where: { userId: studentUserId },
		data: { notes: data.notes },
		select: { notes: true },
	});

	return { userId: studentUserId, notes: updated.notes };
}
