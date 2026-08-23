import {
	CourseKind,
	Prisma,
	VehicleAvailabilityStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { CITIES, COURSE_TYPES } from './constants';
import { addDays, dateOnly, pick, timeOnly } from './dateHelpers';
import type { SeedContext, SeedVehicle } from './types';

export async function seedReferenceData(
	tx: Prisma.TransactionClient,
	context: SeedContext,
): Promise<SeedContext> {
	const courseTypeInputs: Prisma.CourseTypeCreateManyInput[] =
		COURSE_TYPES.map((input) => ({
			id: randomUUID(),
			...input,
		}));
	await tx.courseType.createMany({ data: courseTypeInputs });
	const courseTypes = await tx.courseType.findMany({
		orderBy: { code: 'asc' },
	});

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
		courseTypes.map(
			(type) =>
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
		userDefaultOskRows.push(
			Prisma.sql`(${manager.id}::uuid, ${school.id}::uuid)`,
		);
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
