import { Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import {
	ACTIVE_INSTRUCTOR_USER_WHERE,
	activeInstructorProfileWhere,
	hasInstructorSchoolOwnedByActor,
} from './access';
import {
	mapQualifiedCourseTypes,
	qualifiedCourseTypesSelect,
} from './mappers';
import type { Actor, InstructorDetail, InstructorListItem } from './types';

const prisma = getPrisma();

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
				user: ACTIVE_INSTRUCTOR_USER_WHERE,
			},
		},
		select: {
			instructor: {
				select: {
					id: true,
					qualifiedCourseTypes: {
						select: qualifiedCourseTypesSelect,
						orderBy: { code: 'asc' },
					},
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
		qualifiedCourseTypes: mapQualifiedCourseTypes(
			row.instructor.qualifiedCourseTypes,
		),
	}));

	return { instructors };
}

export async function getInstructorByIdForUser(
	actor: Actor,
	instructorId: string,
): Promise<InstructorDetail> {
	if (actor.role !== Role.ADMIN && actor.role !== Role.MANAGER) {
		throw AppError.forbidden('Forbidden');
	}

	const profile = await prisma.instructorProfile.findFirst({
		where: activeInstructorProfileWhere(instructorId),
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
			qualifiedCourseTypes: {
				select: qualifiedCourseTypesSelect,
				orderBy: { code: 'asc' },
			},
		},
	});

	if (!profile) {
		throw AppError.notFound('Instructor not found');
	}

	const u = profile.user;

	if (
		actor.role === Role.MANAGER &&
		!hasInstructorSchoolOwnedByActor(profile.instructorSchools, actor.id)
	) {
		throw AppError.forbidden('Forbidden');
	}

	const active = profile.instructorSchools.filter(
		(row) => row.school.deletedAt === null,
	);
	const schoolIds = active
		.filter(
			(row) =>
				actor.role === Role.ADMIN || row.school.ownerId === actor.id,
		)
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
		qualifiedCourseTypes: mapQualifiedCourseTypes(
			profile.qualifiedCourseTypes,
		),
		schoolIds,
	};
}
