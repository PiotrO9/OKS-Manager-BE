import { CourseKind, Prisma, VehicleAvailabilityStatus } from '@prisma/client';
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
		const vehicleCount = context.seedPlan.schools[i]!.vehicles;
		for (let v = 1; v <= vehicleCount; v += 1) {
			const vehicleId = randomUUID();
			const isUnavailable = vehicleCount >= 3 && v === vehicleCount;
			const isActive = !isUnavailable;
			const availabilityStatus = isUnavailable
				? VehicleAvailabilityStatus.UNAVAILABLE
				: VehicleAvailabilityStatus.ACTIVE;
			if (v === 1) {
				defaultVehicleBySchool.set(school.id, vehicleId);
			}
			vehicles.push({
				id: vehicleId,
				schoolId: school.id,
				isActive,
				availabilityStatus,
			});
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
				availabilityStatus,
				isActive,
				note: isUnavailable ? 'Pojazd serwisowy w danych demo.' : null,
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

	let instructorOffset = 0;
	for (let schoolIndex = 0; schoolIndex < schools.length; schoolIndex += 1) {
		const school = schools[schoolIndex]!;
		const instructorCount =
			context.seedPlan.schools[schoolIndex]!.instructors;
		const schoolInstructors = context.instructors.slice(
			instructorOffset,
			instructorOffset + instructorCount,
		);
		for (
			let localIndex = 0;
			localIndex < schoolInstructors.length;
			localIndex += 1
		) {
			const instructor = schoolInstructors[localIndex]!;
			const instructorIndex = instructorOffset + localIndex;
			userDefaultOskRows.push(
				Prisma.sql`(${instructor.id}::uuid, ${school.id}::uuid)`,
			);
			instructorSchools.push({
				id: randomUUID(),
				instructorId: instructor.instructorProfile.id,
				schoolId: school.id,
			});
			const qualificationCount = Math.min(
				courseTypes.length,
				Math.max(
					2,
					2 + (instructorIndex % Math.max(1, courseTypes.length - 1)),
				),
			);
			for (const type of courseTypes.slice(0, qualificationCount)) {
				instructorQualificationRows.push(
					Prisma.sql`(${type.id}::uuid, ${instructor.instructorProfile.id}::uuid)`,
				);
			}
			for (let day = 1; day <= 5; day += 1) {
				instructorWorkingHoursDefaults.push({
					id: randomUUID(),
					instructorId: instructor.instructorProfile.id,
					dayOfWeek: day,
					startTime: timeOnly(8 + (instructorIndex % 2)),
					endTime: timeOnly(16 + (instructorIndex % 3)),
				});
			}
			if (instructorIndex % 4 === 0) {
				instructorLeaves.push({
					id: randomUUID(),
					instructorId: instructor.instructorProfile.id,
					startDate: dateOnly(
						addDays(new Date(), 14 + instructorIndex),
					),
					endDate: dateOnly(
						addDays(new Date(), 16 + instructorIndex),
					),
				});
			}
		}
		instructorOffset += instructorCount;
	}

	const studentSchools: Prisma.StudentSchoolCreateManyInput[] = [];
	let studentOffset = 0;
	for (let schoolIndex = 0; schoolIndex < schools.length; schoolIndex += 1) {
		const school = schools[schoolIndex]!;
		const studentCount = context.seedPlan.schools[schoolIndex]!.students;
		const schoolStudents = context.students.slice(
			studentOffset,
			studentOffset + studentCount,
		);
		for (const student of schoolStudents) {
			userDefaultOskRows.push(
				Prisma.sql`(${student.id}::uuid, ${school.id}::uuid)`,
			);
			studentSchools.push({
				id: randomUUID(),
				studentId: student.studentProfile.id,
				schoolId: school.id,
			});
		}
		studentOffset += studentCount;
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
