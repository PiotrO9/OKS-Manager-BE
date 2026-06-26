import { Role, type PrismaClient } from '@prisma/client';
import { ensureAuthUsers } from './devResetSeed/authUsers';
import { AUTH_ACCOUNTS, DEMO_ACCOUNTS } from './devResetSeed/constants';
import { resetDatabase } from './devResetSeed/database';
import { seedOperationalData } from './devResetSeed/operationalData';
import { seedReferenceData } from './devResetSeed/referenceData';
import { createUsers } from './devResetSeed/users';

export async function resetAndSeedDemoDatabase(prisma: PrismaClient) {
	const stageTiming: Record<string, number> = {};

	let stageStartedAt = Date.now();
	const authUserIdsByEmail = await ensureAuthUsers(AUTH_ACCOUNTS);
	stageTiming.authMs = Date.now() - stageStartedAt;

	stageStartedAt = Date.now();
	await resetDatabase(prisma);
	stageTiming.resetMs = Date.now() - stageStartedAt;

	const result = await prisma.$transaction(
		async (tx) => {
			stageStartedAt = Date.now();
			const usersContext = await createUsers(tx, authUserIdsByEmail);
			stageTiming.usersMs = Date.now() - stageStartedAt;

			stageStartedAt = Date.now();
			const referenceContext = await seedReferenceData(tx, usersContext);
			stageTiming.referenceDataMs = Date.now() - stageStartedAt;

			stageStartedAt = Date.now();
			const operationalCounts = await seedOperationalData(tx, referenceContext);
			stageTiming.operationalDataMs = Date.now() - stageStartedAt;

			const created = {
				users: usersContext.users.length,
				userProfiles: usersContext.users.length,
				userSettings: usersContext.users.length,
				admins: usersContext.users.filter((user) => user.role === Role.ADMIN)
					.length,
				managers: usersContext.managers.length,
				instructors: usersContext.instructors.length,
				students: usersContext.students.length,
				drivingSchools: usersContext.managers.length,
				schoolSettings: usersContext.managers.length,
				instructorSchools: usersContext.instructors.length,
				studentSchools: usersContext.students.length,
				courseTypes: referenceContext.courseTypes.length,
				vehicles: referenceContext.vehicles.length,
				courses: operationalCounts.courses,
				courseParticipants: operationalCounts.courseParticipants,
				lessons: operationalCounts.lessons,
				instructorEvents: operationalCounts.events,
				eventParticipants: operationalCounts.eventParticipants,
				paymentPlans: operationalCounts.paymentPlans,
				payments: operationalCounts.payments,
				lessonRatings: operationalCounts.ratings,
				instructorWorkingHoursDefaults:
					usersContext.instructors.length * 5,
				instructorWorkingHours: 0,
				instructorTimeBlocks: operationalCounts.instructorTimeBlocks,
				instructorLeaves: usersContext.instructors.filter(
					(_, index) => index % 4 === 0,
				).length,
			};

			return {
				created,
				stageTiming,
				demoAccounts: DEMO_ACCOUNTS.map((account) => ({
					email: account.email,
					password: account.password,
					role: account.role,
				})),
			};
		},
		{ timeout: 120_000, maxWait: 120_000 },
	);

	return result;
}
