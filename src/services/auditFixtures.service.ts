import {
	CourseKind,
	CourseParticipantStatus,
	PaymentPlanType,
	Role,
	Prisma,
} from '@prisma/client';
import {
	polishLocalDateTimeToDate,
	polishTodayYyyymmdd,
} from '../lib/polishScheduleTime';
import {
	ADMIN_ACCOUNT,
	DEMO_ACCOUNTS,
	DEMO_PASSWORD,
} from './devResetSeed/constants';
import { timeOnly } from './devResetSeed/dateHelpers';

export const AUDIT_FIXTURE_IDS = [
	'manager-only',
	'school-empty',
	'school-staffed',
	'school-operational',
	'booking-ready',
	'payment-ready',
] as const;

export type AuditFixtureId = (typeof AUDIT_FIXTURE_IDS)[number];

const SECOND_INSTRUCTOR_ACCOUNT = {
	email: 'instructor02@audit.osk.local',
	password: DEMO_PASSWORD,
	firstName: 'Anna',
	lastName: 'Instruktorka',
	role: Role.INSTRUCTOR,
} as const;

const SECOND_STUDENT_ACCOUNT = {
	email: 'student02@audit.osk.local',
	password: DEMO_PASSWORD,
	firstName: 'Ola',
	lastName: 'Kursantka',
	role: Role.STUDENT,
} as const;

/** Supabase Auth is prepared before opening the Prisma transaction. */
export const AUDIT_FIXTURE_ACCOUNTS = [
	ADMIN_ACCOUNT,
	DEMO_ACCOUNTS[0],
	DEMO_ACCOUNTS[1],
	SECOND_INSTRUCTOR_ACCOUNT,
	DEMO_ACCOUNTS[2],
	SECOND_STUDENT_ACCOUNT,
] as const;

type AuditAccount = (typeof AUDIT_FIXTURE_ACCOUNTS)[number];

async function createAuditAccount(
	tx: Prisma.TransactionClient,
	account: AuditAccount,
	authUserIdsByEmail: ReadonlyMap<string, string>,
): Promise<string> {
	const userId = authUserIdsByEmail.get(account.email.toLowerCase());
	if (!userId) {
		throw new Error(
			`Missing Auth identity for audit account: ${account.email}`,
		);
	}
	await tx.user.create({
		data: {
			id: userId,
			email: account.email,
			firstName: account.firstName,
			lastName: account.lastName,
			role: account.role,
			settings: { create: { themeMode: 'light', language: 'pl' } },
			profile: { create: {} },
		},
	});
	return userId;
}

/** Restore a minimal technical login after a full application-table reset. */
export async function restoreAuditAdmin(
	tx: Prisma.TransactionClient,
	authUserIdsByEmail: ReadonlyMap<string, string>,
): Promise<{ adminId: string }> {
	const adminId = await createAuditAccount(
		tx,
		ADMIN_ACCOUNT,
		authUserIdsByEmail,
	);
	return { adminId };
}

export function getAuditFixtureAccounts(
	fixtureId: AuditFixtureId,
): readonly AuditAccount[] {
	if (fixtureId === 'manager-only' || fixtureId === 'school-empty') {
		return AUDIT_FIXTURE_ACCOUNTS.slice(0, 2);
	}
	if (fixtureId === 'school-staffed') {
		return AUDIT_FIXTURE_ACCOUNTS.slice(0, 4);
	}
	return AUDIT_FIXTURE_ACCOUNTS;
}

export type AuditFixtureResult = {
	fixture: { id: AuditFixtureId; version: 1 };
	created: {
		users: number;
		userProfiles: number;
		userSettings: number;
		drivingSchools: number;
		schoolSettings: number;
		courseTypes: number;
		instructorProfiles: number;
		instructorSchools: number;
		instructorWorkingHoursDefaults: number;
		studentProfiles: number;
		studentSchools: number;
		vehicles: number;
		courses: number;
		courseParticipants: number;
		paymentPlans: number;
	};
	logicalIds: Record<string, string>;
	bookableWindow?: {
		date: string;
		startTime: string;
		endTime: string;
		timeZone: 'Europe/Warsaw';
	};
};

const OPERATIONAL_FIXTURES: readonly AuditFixtureId[] = [
	'school-operational',
	'booking-ready',
	'payment-ready',
];

function nextBookableWindow(now = new Date()) {
	const today = polishTodayYyyymmdd(now);
	const [year, month, day] = today.split('-').map(Number);
	const date = new Date(Date.UTC(year!, month! - 1, day!));
	do {
		date.setUTCDate(date.getUTCDate() + 1);
	} while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
	const dateString = date.toISOString().slice(0, 10);
	const start = polishLocalDateTimeToDate(dateString, '10:00');
	if (start <= now) {
		throw new Error('Audit booking window must be in the future');
	}
	return {
		date: dateString,
		startTime: '10:00',
		endTime: '11:00',
		timeZone: 'Europe/Warsaw' as const,
	};
}

/**
 * Creates an exact, versioned starting state after the application tables have
 * been cleared. The caller owns the transaction and must reset the database in
 * that same transaction before calling this function.
 */
export async function seedAuditFixture(
	tx: Prisma.TransactionClient,
	fixtureId: AuditFixtureId,
	authUserIdsByEmail: ReadonlyMap<string, string>,
): Promise<AuditFixtureResult> {
	const accounts = getAuditFixtureAccounts(fixtureId);
	for (const account of accounts) {
		if (!authUserIdsByEmail.has(account.email.toLowerCase())) {
			throw new Error(
				`Missing Auth identity for audit account: ${account.email}`,
			);
		}
	}

	const logicalIds: Record<string, string> = {};
	const created: AuditFixtureResult['created'] = {
		users: 0,
		userProfiles: 0,
		userSettings: 0,
		drivingSchools: 0,
		schoolSettings: 0,
		courseTypes: 0,
		instructorProfiles: 0,
		instructorSchools: 0,
		instructorWorkingHoursDefaults: 0,
		studentProfiles: 0,
		studentSchools: 0,
		vehicles: 0,
		courses: 0,
		courseParticipants: 0,
		paymentPlans: 0,
	};

	for (const [index, account] of accounts.entries()) {
		const userId = authUserIdsByEmail.get(account.email.toLowerCase())!;
		const logicalName =
			index === 0
				? 'admin'
				: index === 1
					? 'manager'
					: index <= 3
						? `instructor-${index - 1}`
						: `student-${index - 3}`;
		await createAuditAccount(tx, account, authUserIdsByEmail);
		logicalIds[logicalName] = userId;
		created.users += 1;
		created.userProfiles += 1;
		created.userSettings += 1;
	}

	for (const courseType of [
		{ code: 'A', name: 'Kategoria A' },
		{ code: 'B', name: 'Kategoria B' },
		{ code: 'C', name: 'Kategoria C' },
		{ code: 'CE', name: 'Kategoria C+E' },
	]) {
		const createdType = await tx.courseType.create({ data: courseType });
		logicalIds[`course-type-${courseType.code.toLowerCase()}`] =
			createdType.id;
		created.courseTypes += 1;
	}

	if (fixtureId !== 'manager-only') {
		const school = await tx.drivingSchool.create({
			data: {
				name: 'OSK Audyt Warszawa',
				city: 'Warszawa',
				address: 'ul. Szkoleniowa 1',
				ownerId: logicalIds.manager!,
				settings: {
					create: {
						workingDaysMask: 62,
						workingHoursStart: timeOnly(8),
						workingHoursEnd: timeOnly(18),
						slotDurationMinutes: 60,
						enabledCourseKinds: [
							CourseKind.THEORY_GROUP,
							CourseKind.PRACTICAL,
							CourseKind.EXTRA,
						],
						offeredCourseTypes: {
							connect: [
								{ code: 'A' },
								{ code: 'B' },
								{ code: 'C' },
								{ code: 'CE' },
							],
						},
					},
				},
			},
		});
		logicalIds.school = school.id;
		created.drivingSchools = 1;
		created.schoolSettings = 1;
		await tx.user.update({
			where: { id: logicalIds.manager! },
			data: { defaultOskId: school.id },
		});
	}

	if (accounts.length >= 4) {
		for (let index = 1; index <= 2; index += 1) {
			const instructorKey = `instructor-${index}`;
			const profile = await tx.instructorProfile.create({
				data: {
					userId: logicalIds[instructorKey]!,
					licenseNumber: `AUDIT-INS-${index}`,
					experienceYears: index === 1 ? 8 : 2,
					qualifications:
						index === 1 ? 'Kategorie A i B' : 'Kategoria B',
					qualifiedCourseTypes: {
						connect:
							index === 1
								? [{ code: 'A' }, { code: 'B' }]
								: [{ code: 'B' }],
					},
					instructorSchools: {
						create: { schoolId: logicalIds.school! },
					},
					workingHoursDefault: {
						create: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
							dayOfWeek,
							startTime: timeOnly(index === 1 ? 8 : 10),
							endTime: timeOnly(index === 1 ? 16 : 18),
						})),
					},
				},
			});
			logicalIds[`${instructorKey}-profile`] = profile.id;
			created.instructorProfiles += 1;
			created.instructorSchools += 1;
			created.instructorWorkingHoursDefaults += 5;
			await tx.user.update({
				where: { id: logicalIds[instructorKey]! },
				data: { defaultOskId: logicalIds.school! },
			});
		}
	}

	if (OPERATIONAL_FIXTURES.includes(fixtureId)) {
		for (let index = 1; index <= 2; index += 1) {
			const studentKey = `student-${index}`;
			const profile = await tx.studentProfile.create({
				data: {
					userId: logicalIds[studentKey]!,
					studentSchools: {
						create: { schoolId: logicalIds.school! },
					},
				},
			});
			logicalIds[`${studentKey}-profile`] = profile.id;
			created.studentProfiles += 1;
			created.studentSchools += 1;
			await tx.user.update({
				where: { id: logicalIds[studentKey]! },
				data: { defaultOskId: logicalIds.school! },
			});
		}

		for (const vehicle of [
			{ key: 'vehicle-1', name: 'Toyota Yaris B', plate: 'WA AUD01' },
			{ key: 'vehicle-2', name: 'Hyundai i20 B', plate: 'WA AUD02' },
		]) {
			const row = await tx.vehicle.create({
				data: {
					schoolId: logicalIds.school!,
					name: vehicle.name,
					registrationNumber: vehicle.plate,
					brand: vehicle.name.split(' ')[0],
					model: vehicle.name.split(' ')[1],
				},
			});
			logicalIds[vehicle.key] = row.id;
			created.vehicles += 1;
		}
		await tx.drivingSchool.update({
			where: { id: logicalIds.school! },
			data: { defaultVehicleId: logicalIds['vehicle-1']! },
		});

		for (const course of [
			{
				key: 'course-practical',
				name: 'Audyt: praktyka B',
				kind: CourseKind.PRACTICAL,
				instructorKey: 'instructor-1-profile',
			},
			{
				key: 'course-theory',
				name: 'Audyt: teoria B',
				kind: CourseKind.THEORY_GROUP,
				instructorKey: 'instructor-2-profile',
			},
		]) {
			const row = await tx.course.create({
				data: {
					schoolId: logicalIds.school!,
					name: course.name,
					category: 'B',
					courseTypeId: logicalIds['course-type-b']!,
					kind: course.kind,
					totalHours: 30,
					capacity:
						course.kind === CourseKind.THEORY_GROUP ? 12 : null,
					instructorId: logicalIds[course.instructorKey]!,
				},
			});
			logicalIds[course.key] = row.id;
			created.courses += 1;
		}
	}

	if (fixtureId === 'booking-ready' || fixtureId === 'payment-ready') {
		const participant = await tx.courseParticipant.create({
			data: {
				courseId: logicalIds['course-practical']!,
				studentId: logicalIds['student-1-profile']!,
				status: CourseParticipantStatus.ACTIVE,
			},
		});
		logicalIds['student-1-practical-participant'] = participant.id;
		created.courseParticipants += 1;
	}

	if (fixtureId === 'payment-ready') {
		const plan = await tx.paymentPlan.create({
			data: {
				courseId: logicalIds['course-practical']!,
				totalAmount: new Prisma.Decimal('3000.00'),
				currency: 'PLN',
				type: PaymentPlanType.INSTALLMENTS,
				numberOfInstallments: 3,
			},
		});
		logicalIds['payment-plan-practical'] = plan.id;
		created.paymentPlans += 1;
	}

	return {
		fixture: { id: fixtureId, version: 1 },
		created,
		logicalIds,
		...(fixtureId === 'booking-ready'
			? { bookableWindow: nextBookableWindow() }
			: {}),
	};
}
