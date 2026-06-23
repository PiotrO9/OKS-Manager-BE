import { Role } from '@prisma/client';
import { getPrisma } from '../lib/prisma';
import {
	activeSchoolClause,
	getResolvedDefaultOskIdForOwner,
} from './oskContext';

const prisma = getPrisma();

export type MeDrivingSchoolDto = {
	id: string;
	name: string;
	city: string | null;
	address: string | null;
};

export type MeDrivingSchoolContext = {
	drivingSchools: MeDrivingSchoolDto[];
	defaultOskId: string | null;
};

function toMeDrivingSchoolDto(s: {
	id: string;
	name: string;
	city: string | null;
	address: string | null;
}): MeDrivingSchoolDto {
	return {
		id: s.id,
		name: s.name,
		city: s.city,
		address: s.address,
	};
}

export async function loadDrivingSchoolContextForMe(
	userId: string,
	role: Role,
): Promise<MeDrivingSchoolContext> {
	switch (role) {
	case Role.ADMIN:
		return { drivingSchools: [], defaultOskId: null };

	case Role.MANAGER: {
		const [schools, defaultOskId] = await Promise.all([
			prisma.drivingSchool.findMany({
				where: activeSchoolClause({ ownerId: userId }),
				select: { id: true, name: true, city: true, address: true },
				orderBy: { createdAt: 'asc' },
			}),
			getResolvedDefaultOskIdForOwner(userId),
		]);

		return {
			drivingSchools: schools.map((s) => toMeDrivingSchoolDto(s)),
			defaultOskId,
		};
	}

	case Role.STUDENT: {
		const profile = await prisma.studentProfile.findUnique({
			where: { userId },
			select: {
				studentSchools: {
					select: {
						school: {
							select: {
								id: true,
								name: true,
								city: true,
								address: true,
								deletedAt: true,
							},
						},
					},
				},
			},
		});

		const drivingSchools =
				profile?.studentSchools
					.map((row) => row.school)
					.filter((s) => s.deletedAt === null)
					.map((s) => toMeDrivingSchoolDto(s)) ?? [];

		return { drivingSchools, defaultOskId: null };
	}

	case Role.INSTRUCTOR: {
		const profile = await prisma.instructorProfile.findUnique({
			where: { userId },
			select: {
				instructorSchools: {
					select: {
						school: {
							select: {
								id: true,
								name: true,
								city: true,
								address: true,
								deletedAt: true,
							},
						},
					},
				},
			},
		});

		const drivingSchools =
				profile?.instructorSchools
					.map((row) => row.school)
					.filter((s) => s.deletedAt === null)
					.map((s) => toMeDrivingSchoolDto(s)) ?? [];

		return { drivingSchools, defaultOskId: null };
	}

	default: {
		const _exhaustive: never = role;
		return _exhaustive;
	}
	}
}
