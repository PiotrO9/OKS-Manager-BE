import { Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	getInstructorByIdForUser,
	updateInstructorForManagerOrAdmin,
} from '../../services/instructor.service';

const { prismaMock } = vi.hoisted(() => ({
	prismaMock: {
		courseType: {
			count: vi.fn(),
		},
		instructorProfile: {
			findFirst: vi.fn(),
			update: vi.fn(),
			updateMany: vi.fn(),
		},
		user: {
			updateMany: vi.fn(),
		},
	},
}));

vi.mock('../../lib/prisma', () => ({
	getPrisma: () => prismaMock,
}));

const managerId = '11111111-1111-4111-8111-111111111111';
const instructorId = '22222222-2222-4222-8222-222222222222';
const instructorUserId = '33333333-3333-4333-8333-333333333333';
const schoolId = '44444444-4444-4444-8444-444444444444';
const otherManagerId = '55555555-5555-4555-8555-555555555555';
const courseTypeIdA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const courseTypeIdB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function instructorProfile(
	qualifiedCourseTypes = [],
	ownerId = managerId,
) {
	return {
		id: instructorId,
		userId: instructorUserId,
		experienceYears: 5,
		qualifications: 'tekstowe kwalifikacje',
		user: {
			firstName: 'Jan',
			lastName: 'Kowalski',
			email: 'jan@example.com',
			phone: null,
		},
		instructorSchools: [
			{
				schoolId,
				school: {
					ownerId,
					deletedAt: null,
				},
			},
		],
		qualifiedCourseTypes,
	};
}

describe('getInstructorByIdForUser qualifiedCourseTypes', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('allows admin to read any active instructor with qualified course types', async () => {
		prismaMock.instructorProfile.findFirst.mockResolvedValueOnce(
			instructorProfile(
				[{ id: courseTypeIdA, code: 'A', name: 'Kategoria A' }],
				otherManagerId,
			),
		);

		await expect(
			getInstructorByIdForUser(
				{ id: managerId, role: Role.ADMIN },
				instructorId,
			),
		).resolves.toMatchObject({
			id: instructorId,
			schoolIds: [schoolId],
			qualifiedCourseTypes: [
				{ id: courseTypeIdA, code: 'A', name: 'Kategoria A' },
			],
		});
	});
});

describe('updateInstructorForManagerOrAdmin qualifiedCourseTypeIds', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		prismaMock.instructorProfile.update.mockResolvedValue({});
	});

	it('replaces qualified course types after validating existing CourseType ids', async () => {
		prismaMock.instructorProfile.findFirst
			.mockResolvedValueOnce(instructorProfile())
			.mockResolvedValueOnce(
				instructorProfile([
					{ id: courseTypeIdB, code: 'B', name: 'Kategoria B' },
					{ id: courseTypeIdA, code: 'A', name: 'Kategoria A' },
				]),
			);
		prismaMock.courseType.count.mockResolvedValue(2);

		await expect(
			updateInstructorForManagerOrAdmin(
				{ id: managerId, role: Role.MANAGER },
				instructorId,
				{ qualifiedCourseTypeIds: [courseTypeIdA, courseTypeIdB] },
			),
		).resolves.toMatchObject({
			id: instructorId,
			qualifiedCourseTypes: [
				{ id: courseTypeIdA, code: 'A', name: 'Kategoria A' },
				{ id: courseTypeIdB, code: 'B', name: 'Kategoria B' },
			],
		});

		expect(prismaMock.courseType.count).toHaveBeenCalledWith({
			where: { id: { in: [courseTypeIdA, courseTypeIdB] } },
		});
		expect(prismaMock.instructorProfile.update).toHaveBeenCalledWith({
			where: { id: instructorId },
			data: {
				qualifiedCourseTypes: {
					set: [{ id: courseTypeIdA }, { id: courseTypeIdB }],
				},
			},
		});
		expect(prismaMock.instructorProfile.updateMany).not.toHaveBeenCalled();
		expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
	});

	it('clears qualified course types when an empty array is provided', async () => {
		prismaMock.instructorProfile.findFirst
			.mockResolvedValueOnce(
				instructorProfile([
					{ id: courseTypeIdA, code: 'A', name: 'Kategoria A' },
				]),
			)
			.mockResolvedValueOnce(instructorProfile([]));

		await expect(
			updateInstructorForManagerOrAdmin(
				{ id: managerId, role: Role.MANAGER },
				instructorId,
				{ qualifiedCourseTypeIds: [] },
			),
		).resolves.toMatchObject({
			id: instructorId,
			qualifiedCourseTypes: [],
		});

		expect(prismaMock.courseType.count).not.toHaveBeenCalled();
		expect(prismaMock.instructorProfile.update).toHaveBeenCalledWith({
			where: { id: instructorId },
			data: {
				qualifiedCourseTypes: {
					set: [],
				},
			},
		});
	});

	it('rejects unknown CourseType ids before writing the relation', async () => {
		prismaMock.instructorProfile.findFirst.mockResolvedValueOnce(
			instructorProfile(),
		);
		prismaMock.courseType.count.mockResolvedValue(1);

		await expect(
			updateInstructorForManagerOrAdmin(
				{ id: managerId, role: Role.MANAGER },
				instructorId,
				{ qualifiedCourseTypeIds: [courseTypeIdA, courseTypeIdB] },
			),
		).rejects.toMatchObject({
			statusCode: 400,
			message: 'Invalid qualifiedCourseTypeIds',
		});

		expect(prismaMock.instructorProfile.update).not.toHaveBeenCalled();
		expect(prismaMock.instructorProfile.updateMany).not.toHaveBeenCalled();
		expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
	});
});
