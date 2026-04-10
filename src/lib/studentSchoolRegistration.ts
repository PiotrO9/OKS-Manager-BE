import { Prisma, Role, type PrismaClient } from '@prisma/client';
import { AppError } from './http/AppError';

type Tx = Prisma.TransactionClient;

/**
 * Walidacja OSK przed signUp — kto może przypisać kursanta do tej szkoły.
 */
export async function validateStudentRegistrationSchoolBeforeSignUp(
	prisma: PrismaClient,
	actorRole: Role,
	actorUserId: string,
	schoolId: string,
): Promise<void> {
	const school = await prisma.drivingSchool.findUnique({
		where: { id: schoolId },
	});
	if (!school || school.deletedAt !== null) {
		throw AppError.badRequest('Invalid schoolId');
	}
	if (actorRole === Role.ADMIN) {
		return;
	}
	if (actorRole === Role.MANAGER) {
		if (school.ownerId !== actorUserId) {
			throw AppError.forbidden('Forbidden');
		}
		return;
	}
	if (actorRole === Role.INSTRUCTOR) {
		const link = await prisma.instructorSchool.findFirst({
			where: { schoolId, instructor: { userId: actorUserId } },
		});
		if (!link) {
			throw AppError.forbidden('Forbidden');
		}
		return;
	}
	throw AppError.forbidden('Forbidden');
}

/**
 * Sprawdza aktywną OSK i że aktor (ADMIN/MANAGER) może przypisać kursanta.
 */
export async function assertActorCanAssignStudentToSchoolForAdminOrManager(
	prisma: PrismaClient | Tx,
	actorRole: Role,
	actorUserId: string,
	schoolId: string,
): Promise<void> {
	if (actorRole !== Role.ADMIN && actorRole !== Role.MANAGER) {
		throw AppError.forbidden('Forbidden');
	}
	const school = await prisma.drivingSchool.findUnique({
		where: { id: schoolId },
	});
	if (!school || school.deletedAt !== null) {
		throw AppError.badRequest('Invalid schoolId');
	}
	if (actorRole === Role.MANAGER && school.ownerId !== actorUserId) {
		throw AppError.forbidden('Forbidden');
	}
}

/**
 * Zastępuje wszystkie przypisania kursanta jednym wpisem `student_schools`.
 */
export async function attachStudentToSchoolReplaceInTx(
	tx: Tx,
	userId: string,
	schoolId: string,
): Promise<void> {
	const school = await tx.drivingSchool.findUnique({
		where: { id: schoolId },
	});
	if (!school || school.deletedAt !== null) {
		throw AppError.badRequest('Invalid schoolId');
	}

	const profile = await tx.studentProfile.findUnique({
		where: { userId },
	});
	if (!profile) {
		throw AppError.internal(
			'Registration incomplete: student profile missing',
		);
	}

	await tx.studentSchool.deleteMany({
		where: { studentId: profile.id },
	});
	await tx.studentSchool.create({
		data: { studentId: profile.id, schoolId },
	});
}
