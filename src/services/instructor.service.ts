import { Role } from '@prisma/client';
import { AppError } from '../lib/http/AppError';
import { getPrisma } from '../lib/prisma';

const prisma = getPrisma();

export type InstructorListItem = {
	id: string;
	firstName: string;
	lastName: string;
	email: string;
};

export type InstructorDetail = {
	id: string;
	userId: string;
	firstName: string;
	lastName: string;
	email: string;
	phone: string | null;
	licenseNumber: string;
	experienceYears: number | null;
	qualifications: string | null;
	schoolIds: string[];
};

type Actor = { id: string; role: Role };

export async function listInstructorsBySchoolForUser(
	actor: Actor,
	schoolId: string,
): Promise<{ instructors: InstructorListItem[] }> {
	const school = await prisma.drivingSchool.findUnique({
		where: { id: schoolId },
		select: { id: true, ownerId: true, deletedAt: true },
	});

	if (!school || school.deletedAt !== null) {
		throw AppError.badRequest('Invalid schoolId');
	}

	if (actor.role !== Role.ADMIN && school.ownerId !== actor.id) {
		throw AppError.forbidden('Forbidden');
	}

	const rows = await prisma.instructorSchool.findMany({
		where: {
			schoolId,
			instructor: {
				user: {
					role: Role.INSTRUCTOR,
					deletedAt: null,
					isActive: true,
				},
			},
		},
		select: {
			instructor: {
				select: {
					id: true,
					user: {
						select: {
							firstName: true,
							lastName: true,
							email: true,
						},
					},
				},
			},
		},
		orderBy: {
			instructor: {
				createdAt: 'asc',
			},
		},
	});

	const instructors: InstructorListItem[] = rows.map((row) => ({
		id: row.instructor.id,
		firstName: row.instructor.user.firstName,
		lastName: row.instructor.user.lastName,
		email: row.instructor.user.email,
	}));

	return { instructors };
}

export async function getInstructorByIdForUser(
	actor: Actor,
	instructorId: string,
): Promise<InstructorDetail> {
	const profile = await prisma.instructorProfile.findUnique({
		where: { id: instructorId },
		select: {
			id: true,
			userId: true,
			licenseNumber: true,
			experienceYears: true,
			qualifications: true,
			user: {
				select: {
					firstName: true,
					lastName: true,
					email: true,
					phone: true,
					role: true,
					deletedAt: true,
					isActive: true,
				},
			},
			instructorSchools: {
				select: {
					schoolId: true,
					school: {
						select: { ownerId: true, deletedAt: true },
					},
				},
			},
		},
	});

	if (!profile) {
		throw AppError.notFound('Instructor not found');
	}

	const u = profile.user;
	if (u.role !== Role.INSTRUCTOR || u.deletedAt !== null || !u.isActive) {
		throw AppError.notFound('Instructor not found');
	}

	const linkedToOwnedSchool = profile.instructorSchools.some(
		(row) =>
			row.school.deletedAt === null && row.school.ownerId === actor.id,
	);
	if (!linkedToOwnedSchool) {
		throw AppError.forbidden('Forbidden');
	}

	const active = profile.instructorSchools.filter(
		(row) => row.school.deletedAt === null,
	);
	const schoolIds = active
		.filter((row) => row.school.ownerId === actor.id)
		.map((row) => row.schoolId);

	schoolIds.sort();

	return {
		id: profile.id,
		userId: profile.userId,
		firstName: u.firstName,
		lastName: u.lastName,
		email: u.email,
		phone: u.phone,
		licenseNumber: profile.licenseNumber,
		experienceYears: profile.experienceYears,
		qualifications: profile.qualifications,
		schoolIds,
	};
}

export type InstructorPatchResult = {
	id: string;
	firstName: string;
	lastName: string;
	email: string;
	experienceYears: number | null;
	qualifications: string | null;
};

/** MANAGER — jak GET (powiązanie z własną OSK); ADMIN — dowolny aktywny instruktor. */
export async function updateInstructorForManagerOrAdmin(
	actor: Actor,
	instructorId: string,
	patch: {
		firstName?: string;
		lastName?: string;
		experienceYears?: number;
		qualifications?: string;
	},
): Promise<InstructorPatchResult> {
	if (actor.role !== Role.ADMIN && actor.role !== Role.MANAGER) {
		throw AppError.forbidden('Forbidden');
	}

	const profile = await prisma.instructorProfile.findUnique({
		where: { id: instructorId },
		select: {
			id: true,
			experienceYears: true,
			qualifications: true,
			user: {
				select: {
					firstName: true,
					lastName: true,
					email: true,
					role: true,
					deletedAt: true,
					isActive: true,
				},
			},
			instructorSchools: {
				select: {
					schoolId: true,
					school: {
						select: { ownerId: true, deletedAt: true },
					},
				},
			},
		},
	});

	if (!profile) {
		throw AppError.notFound('Instructor not found');
	}

	const u = profile.user;
	if (u.role !== Role.INSTRUCTOR || u.deletedAt !== null || !u.isActive) {
		throw AppError.notFound('Instructor not found');
	}

	if (actor.role === Role.MANAGER) {
		const linkedToOwnedSchool = profile.instructorSchools.some(
			(row) =>
				row.school.deletedAt === null &&
				row.school.ownerId === actor.id,
		);
		if (!linkedToOwnedSchool) {
			throw AppError.forbidden('Forbidden');
		}
	}

	const userUpdate: { firstName?: string; lastName?: string } = {};
	if (patch.firstName !== undefined) {
		userUpdate.firstName = patch.firstName;
	}
	if (patch.lastName !== undefined) {
		userUpdate.lastName = patch.lastName;
	}

	const hasUserUpdate = Object.keys(userUpdate).length > 0;
	const hasProfileUpdate = patch.experienceYears !== undefined;
	const hasQualificationsUpdate = patch.qualifications !== undefined;

	if (!hasUserUpdate && !hasProfileUpdate && !hasQualificationsUpdate) {
		return {
			id: profile.id,
			firstName: u.firstName,
			lastName: u.lastName,
			email: u.email,
			experienceYears: profile.experienceYears,
			qualifications: profile.qualifications,
		};
	}

	const updated = await prisma.instructorProfile.update({
		where: { id: instructorId },
		data: {
			...(hasProfileUpdate
				? { experienceYears: patch.experienceYears }
				: {}),
			...(hasQualificationsUpdate
				? { qualifications: patch.qualifications }
				: {}),
			...(hasUserUpdate
				? {
						user: {
							update: userUpdate,
						},
					}
				: {}),
		},
		select: {
			id: true,
			experienceYears: true,
			qualifications: true,
			user: {
				select: {
					firstName: true,
					lastName: true,
					email: true,
				},
			},
		},
	});

	return {
		id: updated.id,
		firstName: updated.user.firstName,
		lastName: updated.user.lastName,
		email: updated.user.email,
		experienceYears: updated.experienceYears,
		qualifications: updated.qualifications,
	};
}
