import { Prisma, Role, type PrismaClient } from '@prisma/client';
import { AppError } from './http/AppError';
import { buildInstructorWorkingHoursDefaultRows } from './instructorDefaultWorkingHours';

export async function validateInstructorRegistrationSchoolBeforeSignUp(
	prisma: PrismaClient,
	actorRole: Role,
	actorUserId: string,
	emailTrimmed: string,
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
	if (actorRole !== Role.ADMIN && school.ownerId !== actorUserId) {
		throw AppError.forbidden('Forbidden');
	}

	const existingUser = await prisma.user.findUnique({
		where: { email: emailTrimmed },
		select: {
			instructorProfile: {
				select: {
					_count: { select: { instructorSchools: true } },
				},
			},
		},
	});
	if (
		existingUser?.instructorProfile &&
		existingUser.instructorProfile._count.instructorSchools > 0
	) {
		throw AppError.conflict(
			'Instructor is already assigned to a driving school',
		);
	}
}

type Tx = Prisma.TransactionClient;

/**
 * Dodaje powiązanie instruktora z szkołą i — jeśli instruktor nie ma jeszcze wierszy
 * domyślnych godzin — tworzy je z ustawień szkoły (unik duplikatów przy kolejnych OSK).
 */
export async function addInstructorToSchoolInTx(
	tx: Tx,
	instructorProfileId: string,
	schoolId: string,
): Promise<void> {
	const school = await tx.drivingSchool.findUnique({
		where: { id: schoolId },
		include: { settings: true },
	});
	if (!school || school.deletedAt !== null) {
		throw AppError.badRequest('Invalid schoolId');
	}

	const existingLink = await tx.instructorSchool.findFirst({
		where: { instructorId: instructorProfileId, schoolId },
	});
	if (existingLink) {
		throw AppError.conflict('Already assigned');
	}

	const hourRows = buildInstructorWorkingHoursDefaultRows(
		school.settings ?? null,
	);

	await tx.instructorSchool.create({
		data: { instructorId: instructorProfileId, schoolId },
	});

	const existingDefaultsCount = await tx.instructorWorkingHoursDefault.count({
		where: { instructorId: instructorProfileId },
	});
	if (existingDefaultsCount === 0) {
		await tx.instructorWorkingHoursDefault.createMany({
			data: hourRows.map((r) => ({
				instructorId: instructorProfileId,
				dayOfWeek: r.dayOfWeek,
				startTime: r.startTime,
				endTime: r.endTime,
			})),
		});
	}
}

export async function attachInstructorToSchoolWithDefaultsInTx(
	tx: Tx,
	userId: string,
	schoolId: string,
): Promise<void> {
	const profile = await tx.instructorProfile.findUnique({
		where: { userId },
	});
	if (!profile) {
		throw AppError.internal(
			'Registration incomplete: instructor profile missing',
		);
	}

	const existingSchools = await tx.instructorSchool.count({
		where: { instructorId: profile.id },
	});
	if (existingSchools > 0) {
		throw AppError.conflict(
			'Instructor is already assigned to a driving school',
		);
	}

	await addInstructorToSchoolInTx(tx, profile.id, schoolId);
}
