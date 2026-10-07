import { Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPrisma } from '../../lib/prisma';
import { updateInstructorForManagerOrAdmin } from '../../services/instructor.service';

const prisma = getPrisma();
const suffix = randomUUID();
const ids = {
	managerId: randomUUID(),
	otherManagerId: randomUUID(),
	instructorUserId: randomUUID(),
	instructorId: randomUUID(),
	schoolId: randomUUID(),
	firstTypeId: randomUUID(),
	secondTypeId: randomUUID(),
};
const manager = { id: ids.managerId, role: Role.MANAGER };

describe('instructor PATCH atomicity with PostgreSQL', () => {
	beforeAll(async () => {
		await prisma.user.createMany({
			data: [
				{
					id: ids.managerId,
					firstName: 'Owner',
					lastName: 'Manager',
					email: `bug09-owner-${suffix}@example.test`,
					role: Role.MANAGER,
				},
				{
					id: ids.otherManagerId,
					firstName: 'Other',
					lastName: 'Manager',
					email: `bug09-other-${suffix}@example.test`,
					role: Role.MANAGER,
				},
				{
					id: ids.instructorUserId,
					firstName: 'Original',
					lastName: 'Instructor',
					email: `bug09-instructor-${suffix}@example.test`,
					role: Role.INSTRUCTOR,
				},
			],
		});
		await prisma.drivingSchool.create({
			data: {
				id: ids.schoolId,
				name: `BUG-09 school ${suffix}`,
				ownerId: ids.managerId,
			},
		});
		await prisma.instructorProfile.create({
			data: {
				id: ids.instructorId,
				userId: ids.instructorUserId,
				licenseNumber: `BUG09-${suffix}`,
				experienceYears: 4,
				qualifications: 'Original qualifications',
			},
		});
		await prisma.instructorSchool.create({
			data: { instructorId: ids.instructorId, schoolId: ids.schoolId },
		});
		await prisma.courseType.createMany({
			data: [
				{
					id: ids.firstTypeId,
					code: `BUG09A-${suffix}`,
					name: 'First type',
				},
				{
					id: ids.secondTypeId,
					code: `BUG09B-${suffix}`,
					name: 'Second type',
				},
			],
		});
		await prisma.instructorProfile.update({
			where: { id: ids.instructorId },
			data: {
				qualifiedCourseTypes: { connect: { id: ids.firstTypeId } },
			},
		});
	});

	afterAll(async () => {
		await prisma.$executeRawUnsafe(
			'DROP TRIGGER IF EXISTS bug09_fail_user_patch ON users',
		);
		await prisma.$executeRawUnsafe(
			'DROP FUNCTION IF EXISTS bug09_fail_user_patch()',
		);
		await prisma.$executeRawUnsafe(
			'DROP TRIGGER IF EXISTS bug09_fail_qualification_patch ON "_InstructorQualifiedCourseTypes"',
		);
		await prisma.$executeRawUnsafe(
			'DROP FUNCTION IF EXISTS bug09_fail_qualification_patch()',
		);
		await prisma.instructorSchool.deleteMany({
			where: { instructorId: ids.instructorId },
		});
		await prisma.instructorProfile.deleteMany({
			where: { id: ids.instructorId },
		});
		await prisma.courseType.deleteMany({
			where: { id: { in: [ids.firstTypeId, ids.secondTypeId] } },
		});
		await prisma.drivingSchool.deleteMany({
			where: { id: ids.schoolId },
		});
		await prisma.user.deleteMany({
			where: {
				id: {
					in: [
						ids.managerId,
						ids.otherManagerId,
						ids.instructorUserId,
					],
				},
			},
		});
		await prisma.$disconnect();
	});

	it('rolls back a profile update when the later user update fails', async () => {
		await prisma.$executeRawUnsafe(`
			CREATE FUNCTION bug09_fail_user_patch() RETURNS trigger
			LANGUAGE plpgsql AS $$
			BEGIN
				RAISE EXCEPTION 'BUG09 forced later write failure';
			END;
			$$
		`);
		await prisma.$executeRawUnsafe(`
			CREATE TRIGGER bug09_fail_user_patch
			BEFORE UPDATE OF first_name ON users
			FOR EACH ROW WHEN (NEW.first_name = 'BUG09_FORCE_FAILURE')
			EXECUTE FUNCTION bug09_fail_user_patch()
		`);

		try {
			await expect(
				updateInstructorForManagerOrAdmin(manager, ids.instructorId, {
					firstName: 'BUG09_FORCE_FAILURE',
					experienceYears: 9,
					qualifiedCourseTypeIds: [ids.secondTypeId],
				}),
			).rejects.toThrow();

			const persisted = await prisma.instructorProfile.findUniqueOrThrow({
				where: { id: ids.instructorId },
				include: { user: true, qualifiedCourseTypes: true },
			});
			expect(persisted.experienceYears).toBe(4);
			expect(persisted.user.firstName).toBe('Original');
			expect(
				persisted.qualifiedCourseTypes.map((type) => type.id),
			).toEqual([ids.firstTypeId]);
		} finally {
			await prisma.$executeRawUnsafe(
				'DROP TRIGGER bug09_fail_user_patch ON users',
			);
			await prisma.$executeRawUnsafe(
				'DROP FUNCTION bug09_fail_user_patch()',
			);
		}
	});

	it('rolls back profile and user updates when the qualification write fails', async () => {
		await prisma.$executeRawUnsafe(`
			CREATE FUNCTION bug09_fail_qualification_patch() RETURNS trigger
			LANGUAGE plpgsql AS $$
			BEGIN
				RAISE EXCEPTION 'BUG09 forced qualification failure';
			END;
			$$
		`);
		await prisma.$executeRawUnsafe(`
			CREATE TRIGGER bug09_fail_qualification_patch
			BEFORE INSERT ON "_InstructorQualifiedCourseTypes"
			FOR EACH ROW EXECUTE FUNCTION bug09_fail_qualification_patch()
		`);

		try {
			await expect(
				updateInstructorForManagerOrAdmin(manager, ids.instructorId, {
					firstName: 'Changed before qualification failure',
					experienceYears: 10,
					qualifiedCourseTypeIds: [ids.secondTypeId],
				}),
			).rejects.toThrow();

			const persisted = await prisma.instructorProfile.findUniqueOrThrow({
				where: { id: ids.instructorId },
				include: { user: true, qualifiedCourseTypes: true },
			});
			expect(persisted.experienceYears).toBe(4);
			expect(persisted.user.firstName).toBe('Original');
			expect(
				persisted.qualifiedCourseTypes.map((type) => type.id),
			).toEqual([ids.firstTypeId]);
		} finally {
			await prisma.$executeRawUnsafe(
				'DROP TRIGGER bug09_fail_qualification_patch ON "_InstructorQualifiedCourseTypes"',
			);
			await prisma.$executeRawUnsafe(
				'DROP FUNCTION bug09_fail_qualification_patch()',
			);
		}
	});

	it('keeps ownership, empty PATCH and a successful combined update', async () => {
		await expect(
			updateInstructorForManagerOrAdmin(
				{ id: ids.otherManagerId, role: Role.MANAGER },
				ids.instructorId,
				{ firstName: 'Forbidden' },
			),
		).rejects.toMatchObject({ statusCode: 403 });

		await expect(
			updateInstructorForManagerOrAdmin(manager, ids.instructorId, {}),
		).resolves.toMatchObject({
			firstName: 'Original',
			experienceYears: 4,
		});

		await expect(
			updateInstructorForManagerOrAdmin(manager, ids.instructorId, {
				firstName: 'Updated',
				experienceYears: 8,
				qualifications: 'Updated qualifications',
				qualifiedCourseTypeIds: [ids.secondTypeId],
			}),
		).resolves.toMatchObject({
			firstName: 'Updated',
			experienceYears: 8,
			qualifications: 'Updated qualifications',
			qualifiedCourseTypes: [{ id: ids.secondTypeId }],
		});

		const persisted = await prisma.instructorProfile.findUniqueOrThrow({
			where: { id: ids.instructorId },
			include: { user: true, qualifiedCourseTypes: true },
		});
		expect(persisted.user.firstName).toBe('Updated');
		expect(persisted.experienceYears).toBe(8);
		expect(persisted.qualifiedCourseTypes.map((type) => type.id)).toEqual([
			ids.secondTypeId,
		]);
	});
});
