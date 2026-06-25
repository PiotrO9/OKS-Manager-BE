import {
	CourseKind,
	CourseParticipantStatus,
	EventStatus,
	EventType,
	InstructorTimeBlockType,
	LessonStatus,
	LessonType,
	PaymentPlanType,
	PaymentStatus,
	Prisma,
	Role,
	VehicleAvailabilityStatus,
	type CourseType,
	type InstructorProfile,
	type PrismaClient,
	type StudentProfile,
	type User,
	type Vehicle,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { getSupabaseAdminClient } from '../lib/supabaseAdmin';

const DEMO_PASSWORD = 'Demo1234!';

const DEMO_ACCOUNTS = [
	{
		email: 'manager001@post.pl',
		password: 'manager001',
		firstName: 'Marta',
		lastName: 'Kierownik',
		role: Role.MANAGER,
	},
	{
		email: 'instructor001@post.pl',
		password: 'instructor001',
		firstName: 'Jan',
		lastName: 'Instruktor',
		role: Role.INSTRUCTOR,
	},
	{
		email: 'student001@post.pl',
		password: 'student001',
		firstName: 'Kamil',
		lastName: 'Kursant',
		role: Role.STUDENT,
	},
] as const;

const ADMIN_ACCOUNT = {
	email: 'admin001@post.pl',
	password: 'admin001',
	firstName: 'Adam',
	lastName: 'Administrator',
	role: Role.ADMIN,
} as const;

const AUTH_ACCOUNTS = [ADMIN_ACCOUNT, ...DEMO_ACCOUNTS] as const;

const FIRST_NAMES = [
	'Anna',
	'Piotr',
	'Katarzyna',
	'Tomasz',
	'Julia',
	'Michal',
	'Aleksandra',
	'Pawel',
	'Natalia',
	'Krzysztof',
	'Monika',
	'Bartosz',
	'Karolina',
	'Lukasz',
	'Weronika',
	'Mateusz',
	'Magdalena',
	'Damian',
	'Ewa',
	'Marcin',
];

const LAST_NAMES = [
	'Nowak',
	'Kowalski',
	'Wisniewska',
	'Wojcik',
	'Kowalczyk',
	'Kaminska',
	'Lewandowski',
	'Zielinska',
	'Szymanski',
	'Wozniak',
	'Dabrowska',
	'Kozlowski',
	'Mazur',
	'Jankowska',
	'Krawczyk',
	'Piotrowska',
	'Grabowski',
	'Pawlowska',
	'Nowicka',
	'Adamczyk',
];

const CITIES = ['Warszawa', 'Krakow', 'Lodz', 'Poznan'];
const COURSE_TYPES = [
	{ code: 'A', name: 'Kategoria A' },
	{ code: 'B', name: 'Kategoria B' },
	{ code: 'C', name: 'Kategoria C' },
	{ code: 'CE', name: 'Kategoria C+E' },
];

type SeedUserInput = {
	email: string;
	password: string;
	firstName: string;
	lastName: string;
	role: Role;
	phone?: string | null;
};

type SeedContext = {
	users: User[];
	managers: User[];
	instructors: Array<UserWithProfiles & { instructorProfile: InstructorProfile }>;
	students: Array<UserWithProfiles & { studentProfile: StudentProfile }>;
	courseTypes: CourseType[];
	vehicles: SeedVehicle[];
};

type UserWithProfiles = User & {
	instructorProfile: InstructorProfile | null;
	studentProfile: StudentProfile | null;
};

type SeedVehicle = Pick<Vehicle, 'id' | 'schoolId' | 'isActive'>;

function addDays(date: Date, days: number): Date {
	const next = new Date(date);
	next.setDate(next.getDate() + days);
	return next;
}

function atTime(date: Date, hour: number, minute = 0): Date {
	const next = new Date(date);
	next.setHours(hour, minute, 0, 0);
	return next;
}

function timeOnly(hour: number, minute = 0): Date {
	return new Date(Date.UTC(1970, 0, 1, hour, minute, 0, 0));
}

function dateOnly(date: Date): Date {
	return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

function pick<T>(items: readonly T[], index: number): T {
	return items[index % items.length]!;
}

async function listExistingAuthUserIdsByEmail(
	emails: readonly string[],
): Promise<Map<string, string>> {
	const normalizedEmails = new Set(emails.map((email) => email.toLowerCase()));
	const result = new Map<string, string>();
	if (normalizedEmails.size === 0) {
		return result;
	}

	const supabase = getSupabaseAdminClient();
	const perPage = 1000;
	for (let page = 1; page <= 10; page += 1) {
		const { data, error } = await supabase.auth.admin.listUsers({
			page,
			perPage,
		});
		if (error) {
			throw error;
		}
		for (const user of data.users) {
			const email = user.email?.toLowerCase();
			if (email && normalizedEmails.has(email)) {
				result.set(email, user.id);
			}
		}
		if (result.size === normalizedEmails.size) {
			return result;
		}
		if (data.users.length < perPage) {
			return result;
		}
	}
	return result;
}

async function ensureAuthUsers(
	inputs: readonly SeedUserInput[],
): Promise<Map<string, string>> {
	const supabase = getSupabaseAdminClient();
	const existingByEmail = await listExistingAuthUserIdsByEmail(
		inputs.map((input) => input.email),
	);
	const idsByEmail = new Map<string, string>();

	for (const input of inputs) {
		const normalizedEmail = input.email.toLowerCase();
		const existingId = existingByEmail.get(normalizedEmail);
		if (existingId) {
			const { error } = await supabase.auth.admin.updateUserById(existingId, {
				password: input.password,
				email_confirm: true,
				user_metadata: {
					firstName: input.firstName,
					lastName: input.lastName,
					role: input.role,
				},
			});
			if (error) {
				throw error;
			}
			idsByEmail.set(normalizedEmail, existingId);
			continue;
		}

		const { data, error } = await supabase.auth.admin.createUser({
			email: input.email,
			password: input.password,
			email_confirm: true,
			user_metadata: {
				firstName: input.firstName,
				lastName: input.lastName,
				role: input.role,
			},
		});
		if (error) {
			throw error;
		}
		if (!data.user?.id) {
			throw new Error(`Supabase did not return id for ${input.email}`);
		}
		idsByEmail.set(normalizedEmail, data.user.id);
	}

	return idsByEmail;
}

function buildSeedUsers(): SeedUserInput[] {
	const users: SeedUserInput[] = [ADMIN_ACCOUNT, ...DEMO_ACCOUNTS];

	for (let i = 1; i <= 3; i += 1) {
		users.push({
			email: `manager${String(i).padStart(2, '0')}@demo.osk.local`,
			password: DEMO_PASSWORD,
			firstName: pick(FIRST_NAMES, i),
			lastName: pick(LAST_NAMES, i + 1),
			role: Role.MANAGER,
		});
	}

	for (let i = 1; i <= 12; i += 1) {
		users.push({
			email: `instructor${String(i).padStart(2, '0')}@demo.osk.local`,
			password: DEMO_PASSWORD,
			firstName: pick(FIRST_NAMES, i + 3),
			lastName: pick(LAST_NAMES, i + 5),
			role: Role.INSTRUCTOR,
		});
	}

	for (let i = 1; i <= 80; i += 1) {
		users.push({
			email: `student${String(i).padStart(3, '0')}@demo.osk.local`,
			password: DEMO_PASSWORD,
			firstName: pick(FIRST_NAMES, i + 7),
			lastName: pick(LAST_NAMES, i + 11),
			role: Role.STUDENT,
		});
	}

	return users;
}

async function resetDatabase(prisma: PrismaClient) {
	await prisma.$executeRawUnsafe(`
		TRUNCATE TABLE
			"_InstructorQualifiedCourseTypes",
			"_SchoolSettingsOfferedCourseTypes",
			"event_participants",
			"lesson_ratings",
			"payments",
			"payment_plans",
			"lessons",
			"instructor_events",
			"instructor_time_blocks",
			"instructor_leaves",
			"instructor_working_hours",
			"instructor_working_hours_default",
			"course_participants",
			"courses",
			"course_types",
			"vehicles",
			"student_schools",
			"instructor_schools",
			"student_profiles",
			"instructor_profiles",
			"school_settings",
			"driving_schools",
			"user_profiles",
			"user_settings",
			"users"
		RESTART IDENTITY CASCADE
	`);
}

async function createUsers(
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

async function seedReferenceData(
	tx: Prisma.TransactionClient,
	context: SeedContext,
): Promise<SeedContext> {
	const courseTypeInputs: Prisma.CourseTypeCreateManyInput[] = COURSE_TYPES.map(
		(input) => ({
			id: randomUUID(),
			...input,
		}),
	);
	await tx.courseType.createMany({ data: courseTypeInputs });
	const courseTypes = await tx.courseType.findMany({ orderBy: { code: 'asc' } });

	const schools = context.managers.map((manager, i) => ({
		id: randomUUID(),
		settingsId: randomUUID(),
		managerId: manager.id,
		name: `OSK ${pick(CITIES, i)} Demo ${i + 1}`,
		city: pick(CITIES, i),
		address: `ul. Szkoleniowa ${10 + i}`,
	}));

	await tx.drivingSchool.createMany({
		data: schools.map((school) => ({
			id: school.id,
			name: school.name,
			city: school.city,
			address: school.address,
			ownerId: school.managerId,
		})),
	});

	await tx.schoolSettings.createMany({
		data: schools.map((school) => ({
			id: school.settingsId,
			schoolId: school.id,
			workingDaysMask: 62,
			workingHoursStart: timeOnly(8),
			workingHoursEnd: timeOnly(18),
			slotDurationMinutes: 60,
			enabledCourseKinds: [
				CourseKind.THEORY_GROUP,
				CourseKind.PRACTICAL,
				CourseKind.EXTRA,
			],
		})),
	});

	const offeredCourseRows = schools.flatMap((school) =>
		courseTypes.map((type) =>
			Prisma.sql`(${type.id}::uuid, ${school.settingsId}::uuid)`,
		),
	);
	if (offeredCourseRows.length > 0) {
		await tx.$executeRaw(
			Prisma.sql`INSERT INTO "_SchoolSettingsOfferedCourseTypes" ("A", "B") VALUES ${Prisma.join(offeredCourseRows)}`,
		);
	}

	const vehicles: SeedVehicle[] = [];
	const vehicleInputs: Prisma.VehicleCreateManyInput[] = [];
	const defaultVehicleBySchool = new Map<string, string>();
	for (let i = 0; i < schools.length; i += 1) {
		const school = schools[i]!;
		for (let v = 1; v <= 5; v += 1) {
			const vehicleId = randomUUID();
			const isActive = v !== 5;
			if (v === 1) {
				defaultVehicleBySchool.set(school.id, vehicleId);
			}
			vehicles.push({ id: vehicleId, schoolId: school.id, isActive });
			vehicleInputs.push({
				id: vehicleId,
				schoolId: school.id,
				name: `Pojazd ${v} - ${pick(['Toyota Yaris', 'Hyundai i20', 'Kia Rio', 'Skoda Fabia'], v)}`,
				registrationNumber: `DW${i}${String(v).padStart(4, '0')}`,
				brand: pick(['Toyota', 'Hyundai', 'Kia', 'Skoda'], v),
				model: pick(['Yaris', 'i20', 'Rio', 'Fabia'], v),
				modelYear: 2018 + ((i + v) % 6),
				mileageKm: 35000 + i * 9000 + v * 4200,
				inspectionDate: addDays(new Date(), 80 + v * 12),
				insuranceDate: addDays(new Date(), 120 + v * 10),
				availabilityStatus:
					v === 5
						? VehicleAvailabilityStatus.UNAVAILABLE
						: VehicleAvailabilityStatus.ACTIVE,
				isActive,
				note: v === 5 ? 'Pojazd serwisowy w danych demo.' : null,
			});
		}
	}
	await tx.vehicle.createMany({ data: vehicleInputs });

	const defaultVehicleRows = schools.map(
		(school) =>
			Prisma.sql`(${school.id}::uuid, ${defaultVehicleBySchool.get(school.id)}::uuid)`,
	);
	await tx.$executeRaw(
		Prisma.sql`
			UPDATE "driving_schools" AS ds
			SET "default_vehicle_id" = v."defaultVehicleId"
			FROM (VALUES ${Prisma.join(defaultVehicleRows)}) AS v("schoolId", "defaultVehicleId")
			WHERE ds."id" = v."schoolId"
		`,
	);

	const userDefaultOskRows: Prisma.Sql[] = [];
	const instructorSchools: Prisma.InstructorSchoolCreateManyInput[] = [];
	const instructorWorkingHoursDefaults: Prisma.InstructorWorkingHoursDefaultCreateManyInput[] =
		[];
	const instructorLeaves: Prisma.InstructorLeaveCreateManyInput[] = [];
	const instructorQualificationRows: Prisma.Sql[] = [];

	for (let i = 0; i < context.managers.length; i += 1) {
		const manager = context.managers[i]!;
		const school = schools[i % schools.length]!;
		userDefaultOskRows.push(Prisma.sql`(${manager.id}::uuid, ${school.id}::uuid)`);
	}

	for (let i = 0; i < context.instructors.length; i += 1) {
		const instructor = context.instructors[i]!;
		const school = schools[i % schools.length]!;
		userDefaultOskRows.push(
			Prisma.sql`(${instructor.id}::uuid, ${school.id}::uuid)`,
		);
		instructorSchools.push({
			id: randomUUID(),
			instructorId: instructor.instructorProfile.id,
			schoolId: school.id,
		});
		for (const type of courseTypes.slice(0, 1 + (i % courseTypes.length))) {
			instructorQualificationRows.push(
				Prisma.sql`(${type.id}::uuid, ${instructor.instructorProfile.id}::uuid)`,
			);
		}
		for (let day = 1; day <= 5; day += 1) {
			instructorWorkingHoursDefaults.push({
				id: randomUUID(),
				instructorId: instructor.instructorProfile.id,
				dayOfWeek: day,
				startTime: timeOnly(8 + (i % 2)),
				endTime: timeOnly(16 + (i % 3)),
			});
		}
		if (i % 4 === 0) {
			instructorLeaves.push({
				id: randomUUID(),
				instructorId: instructor.instructorProfile.id,
				startDate: dateOnly(addDays(new Date(), 14 + i)),
				endDate: dateOnly(addDays(new Date(), 16 + i)),
			});
		}
	}

	const studentSchools: Prisma.StudentSchoolCreateManyInput[] = [];
	for (let i = 0; i < context.students.length; i += 1) {
		const student = context.students[i]!;
		const school = schools[i % schools.length]!;
		userDefaultOskRows.push(
			Prisma.sql`(${student.id}::uuid, ${school.id}::uuid)`,
		);
		studentSchools.push({
			id: randomUUID(),
			studentId: student.studentProfile.id,
			schoolId: school.id,
		});
	}

	await tx.instructorSchool.createMany({ data: instructorSchools });
	await tx.studentSchool.createMany({ data: studentSchools });
	await tx.instructorWorkingHoursDefault.createMany({
		data: instructorWorkingHoursDefaults,
	});
	if (instructorLeaves.length > 0) {
		await tx.instructorLeave.createMany({ data: instructorLeaves });
	}
	if (instructorQualificationRows.length > 0) {
		await tx.$executeRaw(
			Prisma.sql`INSERT INTO "_InstructorQualifiedCourseTypes" ("A", "B") VALUES ${Prisma.join(instructorQualificationRows)}`,
		);
	}
	if (userDefaultOskRows.length > 0) {
		await tx.$executeRaw(
			Prisma.sql`
				UPDATE "users" AS u
				SET "default_osk_id" = v."schoolId"
				FROM (VALUES ${Prisma.join(userDefaultOskRows)}) AS v("userId", "schoolId")
				WHERE u."id" = v."userId"
			`,
		);
	}

	return {
		...context,
		courseTypes,
		vehicles,
	};
}

async function seedOperationalData(
	tx: Prisma.TransactionClient,
	context: SeedContext,
) {
	const schools = await tx.drivingSchool.findMany({ orderBy: { name: 'asc' } });
	const courses: Prisma.CourseCreateManyInput[] = [];
	const courseParticipants: Prisma.CourseParticipantCreateManyInput[] = [];
	const paymentPlans: Prisma.PaymentPlanCreateManyInput[] = [];
	const payments: Prisma.PaymentCreateManyInput[] = [];
	const lessons: Prisma.LessonCreateManyInput[] = [];
	const lessonRatings: Prisma.LessonRatingCreateManyInput[] = [];
	const instructorEvents: Prisma.InstructorEventCreateManyInput[] = [];
	const eventParticipants: Prisma.EventParticipantCreateManyInput[] = [];
	const instructorTimeBlocks: Prisma.InstructorTimeBlockCreateManyInput[] = [];

	type SeedCourse = {
		id: string;
		kind: CourseKind;
		instructor: UserWithProfiles & { instructorProfile: InstructorProfile };
		participants: Array<UserWithProfiles & { studentProfile: StudentProfile }>;
		schoolVehicles: SeedVehicle[];
	};

	const seedCourses: SeedCourse[] = [];

	for (let s = 0; s < schools.length; s += 1) {
		const school = schools[s]!;
		const schoolInstructors = context.instructors.filter(
			(_, index) => index % schools.length === s,
		);
		const schoolStudents = context.students.filter(
			(_, index) => index % schools.length === s,
		);
		const schoolVehicles = context.vehicles.filter(
			(vehicle) => vehicle.schoolId === school.id && vehicle.isActive,
		);

		for (let c = 0; c < 8; c += 1) {
			const courseId = randomUUID();
			const courseType = context.courseTypes[c % context.courseTypes.length]!;
			const kind = pick(
				[
					CourseKind.THEORY_GROUP,
					CourseKind.PRACTICAL,
					CourseKind.EXTRA,
				],
				c,
			);
			const instructor = pick(schoolInstructors, c);
			const participants = schoolStudents.slice(c * 2, c * 2 + 12);

			courses.push({
				id: courseId,
				schoolId: school.id,
				name: `${courseType.name} - grupa ${s + 1}/${c + 1}`,
				category: courseType.code,
				courseTypeId: courseType.id,
				kind,
				totalHours:
					kind === CourseKind.THEORY_GROUP
						? 30
						: kind === CourseKind.EXTRA
							? 10
							: 30,
				capacity: kind === CourseKind.THEORY_GROUP ? 20 : null,
				theoryStartDate:
					kind === CourseKind.THEORY_GROUP
						? dateOnly(addDays(new Date(), -45 + c * 7))
						: null,
				theoryEndDate:
					kind === CourseKind.THEORY_GROUP
						? dateOnly(addDays(new Date(), -30 + c * 7))
						: null,
				instructorId: instructor.instructorProfile.id,
				status: c % 7 === 0 ? 'finished' : 'active',
			});

			seedCourses.push({
				id: courseId,
				kind,
				instructor,
				participants,
				schoolVehicles,
			});

			for (let p = 0; p < participants.length; p += 1) {
				const student = participants[p]!;
				courseParticipants.push({
					courseId,
					studentId: student.studentProfile.id,
					status:
						c % 7 === 0 || p % 9 === 0
							? CourseParticipantStatus.FINISHED
							: CourseParticipantStatus.ACTIVE,
				});
			}

			const paymentPlanId = randomUUID();
			paymentPlans.push({
				id: paymentPlanId,
				courseId,
				totalAmount: kind === CourseKind.EXTRA ? 900 : 3600,
				type:
					c % 2 === 0 ? PaymentPlanType.INSTALLMENTS : PaymentPlanType.FULL,
				numberOfInstallments: c % 2 === 0 ? 4 : null,
				status: 'active',
			});

			const installments = c % 2 === 0 ? 4 : 1;
			for (let p = 0; p < installments; p += 1) {
				payments.push({
					id: randomUUID(),
					paymentPlanId,
					amount: installments === 1 ? 3600 : 900,
					dueDate: dateOnly(addDays(new Date(), -30 + p * 30)),
					paidAt: p < 2 ? addDays(new Date(), -28 + p * 30) : null,
					status:
						p < 2
							? PaymentStatus.PAID
							: p === 2 && c % 5 === 0
								? PaymentStatus.FAILED
								: PaymentStatus.PENDING,
					method: p < 2 ? pick(['card', 'transfer', 'cash'], p) : null,
				});
			}

			for (let l = 0; l < Math.min(18, participants.length * 2); l += 1) {
				const lessonId = randomUUID();
				const student = pick(participants, l);
				const lessonDate = addDays(new Date(), -35 + c * 4 + l);
				const start = atTime(lessonDate, 8 + (l % 8));
				const end = atTime(lessonDate, 9 + (l % 8), l % 3 === 0 ? 30 : 0);
				const status = pick(
					[
						LessonStatus.COMPLETED,
						LessonStatus.SCHEDULED,
						LessonStatus.CANCELLED,
					],
					l + c,
				);
				const lessonType =
					kind === CourseKind.THEORY_GROUP
						? LessonType.THEORY
						: LessonType.PRACTICE;
				lessons.push({
					id: lessonId,
					courseId,
					studentId: student.studentProfile.id,
					instructorId: instructor.instructorProfile.id,
					vehicleId: pick(schoolVehicles, l)?.id ?? null,
					lessonType,
					startTime: start,
					endTime: end,
					status,
				});

				if (
					status === LessonStatus.COMPLETED &&
					lessonType === LessonType.PRACTICE &&
					l % 2 === 0
				) {
					lessonRatings.push({
						id: randomUUID(),
						lessonId,
						studentId: student.studentProfile.id,
						instructorId: instructor.instructorProfile.id,
						rating: 4 + (l % 2),
						comment:
							l % 4 === 0
								? 'Bardzo konkretne wskazowki po jezdzie.'
								: null,
					});
				}
			}

			if (kind === CourseKind.THEORY_GROUP) {
				for (let e = 0; e < 3; e += 1) {
					const eventId = randomUUID();
					instructorEvents.push({
						id: eventId,
						instructorId: instructor.instructorProfile.id,
						courseId,
						type: EventType.THEORY,
						startTime: atTime(addDays(new Date(), -7 + e * 7), 17),
						endTime: atTime(addDays(new Date(), -7 + e * 7), 19),
						capacity: 20,
						status: pick(
							[
								EventStatus.DONE,
								EventStatus.PLANNED,
								EventStatus.CANCELLED,
							],
							e + c,
						),
					});
					for (const student of participants.slice(0, 10)) {
						eventParticipants.push({
							id: randomUUID(),
							eventId,
							studentId: student.studentProfile.id,
						});
					}
				}
			}
		}

		for (let i = 0; i < schoolInstructors.length; i += 1) {
			const instructor = schoolInstructors[i]!;
			for (let b = 0; b < 4; b += 1) {
				instructorTimeBlocks.push({
					id: randomUUID(),
					instructorId: instructor.instructorProfile.id,
					schoolId: school.id,
					startTime: atTime(addDays(new Date(), b * 3 + i), 12),
					endTime: atTime(addDays(new Date(), b * 3 + i), 13),
					type: pick(
						[
							InstructorTimeBlockType.BREAK,
							InstructorTimeBlockType.MEETING,
							InstructorTimeBlockType.OTHER,
						],
						b,
					),
				});
			}
		}
	}

	if (courses.length > 0) await tx.course.createMany({ data: courses });
	if (courseParticipants.length > 0) {
		await tx.courseParticipant.createMany({ data: courseParticipants });
	}
	if (paymentPlans.length > 0) {
		await tx.paymentPlan.createMany({ data: paymentPlans });
	}
	if (payments.length > 0) await tx.payment.createMany({ data: payments });
	if (lessons.length > 0) await tx.lesson.createMany({ data: lessons });
	if (lessonRatings.length > 0) {
		await tx.lessonRating.createMany({ data: lessonRatings });
	}
	if (instructorEvents.length > 0) {
		await tx.instructorEvent.createMany({ data: instructorEvents });
	}
	if (eventParticipants.length > 0) {
		await tx.eventParticipant.createMany({ data: eventParticipants });
	}
	if (instructorTimeBlocks.length > 0) {
		await tx.instructorTimeBlock.createMany({ data: instructorTimeBlocks });
	}

	return {
		courses: seedCourses.length,
		courseParticipants: courseParticipants.length,
		lessons: lessons.length,
		events: instructorEvents.length,
		eventParticipants: eventParticipants.length,
		paymentPlans: paymentPlans.length,
		payments: payments.length,
		ratings: lessonRatings.length,
		instructorTimeBlocks: instructorTimeBlocks.length,
	};
}

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
