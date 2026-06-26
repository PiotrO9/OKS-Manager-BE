import { Prisma, Role, type InstructorProfile, type StudentProfile } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { buildSeedUsers } from './authUsers';
import type { SeedContext, UserWithProfiles } from './types';

export async function createUsers(
	tx: Prisma.TransactionClient,
	authUserIdsByEmail: ReadonlyMap<string, string>,
): Promise<SeedContext> {
	const seedUsers = buildSeedUsers();
	const usersToCreate: Prisma.UserCreateManyInput[] = [];
	const userProfiles: Prisma.UserProfileCreateManyInput[] = [];
	const userSettings: Prisma.UserSettingsCreateManyInput[] = [];
	const instructorProfiles: Prisma.InstructorProfileCreateManyInput[] = [];
	const studentProfiles: Prisma.StudentProfileCreateManyInput[] = [];

	for (let index = 0; index < seedUsers.length; index += 1) {
		const input = seedUsers[index]!;
		const userId =
			authUserIdsByEmail.get(input.email.toLowerCase()) ?? randomUUID();
		const ordinal = index + 1;

		usersToCreate.push({
			id: userId,
			email: input.email,
			firstName: input.firstName,
			lastName: input.lastName,
			phone: input.phone ?? `+48 5${String(ordinal).padStart(8, '0')}`,
			role: input.role,
		});

		userSettings.push({
			id: randomUUID(),
			userId,
			themeMode: 'light',
			language: 'pl',
		});

		userProfiles.push({
			id: randomUUID(),
			userId,
			bio:
				input.role === Role.INSTRUCTOR
					? 'Instruktor jazdy z doswiadczeniem w pracy z kursantami.'
					: null,
		});

		if (input.role === Role.INSTRUCTOR) {
			instructorProfiles.push({
				id: randomUUID(),
				userId,
				licenseNumber: `INS-${String(ordinal).padStart(5, '0')}`,
				experienceYears: 2 + (index % 12),
				qualifications:
					'Kat. B, jazda miejska, przygotowanie do egzaminu.',
			});
		}

		if (input.role === Role.STUDENT) {
			studentProfiles.push({
				id: randomUUID(),
				userId,
				pesel: `90${String(ordinal).padStart(9, '0')}`,
				pkkNumber: `PKK${String(ordinal).padStart(8, '0')}`,
				notes:
					index % 5 === 0
						? 'Wymaga dodatkowych jazd przed egzaminem.'
						: null,
			});
		}
	}

	await tx.user.createMany({ data: usersToCreate });
	await tx.userSettings.createMany({ data: userSettings });
	await tx.userProfile.createMany({ data: userProfiles });
	if (instructorProfiles.length > 0) {
		await tx.instructorProfile.createMany({ data: instructorProfiles });
	}
	if (studentProfiles.length > 0) {
		await tx.studentProfile.createMany({ data: studentProfiles });
	}

	const users: UserWithProfiles[] = await tx.user.findMany({
		include: { instructorProfile: true, studentProfile: true },
		orderBy: { email: 'asc' },
	});

	return {
		users,
		managers: users.filter((user) => user.role === Role.MANAGER),
		instructors: users.filter(
			(
				user,
			): user is UserWithProfiles & {
				instructorProfile: InstructorProfile;
			} =>
				user.role === Role.INSTRUCTOR && user.instructorProfile !== null,
		),
		students: users.filter(
			(user): user is UserWithProfiles & { studentProfile: StudentProfile } =>
				user.role === Role.STUDENT && user.studentProfile !== null,
		),
		courseTypes: [],
		vehicles: [],
	};
}
