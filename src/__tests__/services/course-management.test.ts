import { CourseKind } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createCourseForUser,
	patchCourseInstructorForOwner,
} from '../../services/course/commands';

const { prismaMock, qualificationMock } = vi.hoisted(() => ({
	prismaMock: {
		course: {
			create: vi.fn(),
			findUnique: vi.fn(),
			update: vi.fn(),
		},
		courseType: {
			findUnique: vi.fn(),
		},
		drivingSchool: {
			findUnique: vi.fn(),
		},
		instructorSchool: {
			findFirst: vi.fn(),
		},
		schoolSettings: {
			findUnique: vi.fn(),
		},
	},
	qualificationMock: vi.fn(),
}));

vi.mock('../../lib/prisma', () => ({
	getPrisma: () => prismaMock,
}));

vi.mock('../../lib/instructorCourseQualification', () => ({
	assertInstructorQualifiedForCourseType: qualificationMock,
}));

const managerId = '11111111-1111-4111-8111-111111111111';
const schoolId = '22222222-2222-4222-8222-222222222222';
const courseId = '33333333-3333-4333-8333-333333333333';
const instructorId = '44444444-4444-4444-8444-444444444444';
const courseTypeId = '55555555-5555-4555-8555-555555555555';

function courseTypeRow() {
	return {
		id: courseTypeId,
		code: 'B',
		name: 'Kategoria B',
	};
}

function courseDetailRow(
	overrides: Partial<{ instructorId: string | null }> = {},
) {
	return {
		id: courseId,
		schoolId,
		name: 'Kurs B',
		category: 'B',
		courseTypeId,
		kind: CourseKind.THEORY_GROUP,
		totalHours: 30,
		capacity: 12,
		deletedAt: null,
		instructorId: overrides.instructorId ?? null,
		courseType: courseTypeRow(),
		instructor:
			overrides.instructorId === null
				? null
				: {
						user: {
							id: instructorId,
							firstName: 'Jan',
							lastName: 'Kowalski',
						},
					},
		school: {
			ownerId: managerId,
		},
	};
}

describe('course management service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		qualificationMock.mockResolvedValue(undefined);
		prismaMock.drivingSchool.findUnique.mockResolvedValue({
			id: schoolId,
			ownerId: managerId,
			deletedAt: null,
		});
		prismaMock.schoolSettings.findUnique.mockResolvedValue({
			enabledCourseKinds: [CourseKind.THEORY_GROUP, CourseKind.PRACTICAL],
		});
		prismaMock.courseType.findUnique.mockResolvedValue(courseTypeRow());
		prismaMock.instructorSchool.findFirst.mockResolvedValue({
			instructorId,
			schoolId,
		});
		prismaMock.course.create.mockResolvedValue({
			id: courseId,
			schoolId,
			name: 'Kurs B',
			category: 'B',
			courseTypeId,
			kind: CourseKind.THEORY_GROUP,
			totalHours: 30,
			capacity: 12,
			theoryStartDate: new Date('2026-09-01T00:00:00.000Z'),
			theoryEndDate: new Date('2026-09-30T00:00:00.000Z'),
			instructorId,
			status: 'ACTIVE',
			createdAt: new Date('2026-08-01T00:00:00.000Z'),
			courseType: courseTypeRow(),
		});
		prismaMock.course.findUnique.mockResolvedValue(courseDetailRow());
		prismaMock.course.update.mockResolvedValue({});
	});

	it('creates a theory group course only for an owned school and qualified instructor', async () => {
		const theoryStartDate = new Date('2026-09-01T00:00:00.000Z');
		const theoryEndDate = new Date('2026-09-30T00:00:00.000Z');

		await expect(
			createCourseForUser(managerId, {
				schoolId,
				name: 'Kurs B',
				category: ' B ',
				kind: CourseKind.THEORY_GROUP,
				totalHours: 30,
				capacity: 12,
				instructorId,
				theoryStartDate,
				theoryEndDate,
			}),
		).resolves.toMatchObject({
			id: courseId,
			category: 'B',
			courseType: courseTypeRow(),
			kind: CourseKind.THEORY_GROUP,
			capacity: 12,
			instructorId,
		});

		expect(prismaMock.drivingSchool.findUnique).toHaveBeenCalledWith({
			where: { id: schoolId },
		});
		expect(prismaMock.courseType.findUnique).toHaveBeenCalledWith({
			where: { code: 'B' },
			select: { id: true, code: true, name: true },
		});
		expect(qualificationMock).toHaveBeenCalledWith(
			instructorId,
			courseTypeId,
		);
		expect(prismaMock.course.create).toHaveBeenCalledWith({
			data: {
				schoolId,
				name: 'Kurs B',
				category: 'B',
				courseTypeId,
				kind: CourseKind.THEORY_GROUP,
				totalHours: 30,
				capacity: 12,
				theoryStartDate,
				theoryEndDate,
				instructorId,
			},
			include: {
				courseType: { select: { id: true, code: true, name: true } },
			},
		});
	});

	it('rejects course creation when the manager does not own the school', async () => {
		prismaMock.drivingSchool.findUnique.mockResolvedValue(null);

		await expect(
			createCourseForUser(managerId, {
				schoolId,
				name: 'Kurs B',
				category: 'B',
				kind: CourseKind.PRACTICAL,
				totalHours: 30,
			}),
		).rejects.toMatchObject({
			statusCode: 403,
			message: 'Forbidden',
		});

		expect(prismaMock.course.create).not.toHaveBeenCalled();
	});

	it('patches course instructor and capacity after ownership and qualification checks', async () => {
		await expect(
			patchCourseInstructorForOwner(managerId, courseId, {
				instructorId,
				capacity: 18,
			}),
		).resolves.toMatchObject({
			id: courseId,
			instructor: {
				id: instructorId,
				name: 'Jan Kowalski',
			},
		});

		expect(prismaMock.course.findUnique).toHaveBeenCalledWith({
			where: { id: courseId },
			include: {
				school: { select: { ownerId: true } },
			},
		});
		expect(prismaMock.instructorSchool.findFirst).toHaveBeenCalledWith({
			where: {
				instructorId,
				schoolId,
			},
		});
		expect(qualificationMock).toHaveBeenCalledWith(
			instructorId,
			courseTypeId,
		);
		expect(prismaMock.course.update).toHaveBeenCalledWith({
			where: { id: courseId },
			data: {
				instructorId,
				capacity: 18,
			},
		});
	});

	it('rejects capacity patch for non-theory courses', async () => {
		prismaMock.course.findUnique.mockResolvedValue({
			...courseDetailRow({ instructorId: null }),
			kind: CourseKind.PRACTICAL,
		});

		await expect(
			patchCourseInstructorForOwner(managerId, courseId, {
				capacity: 18,
			}),
		).rejects.toMatchObject({
			statusCode: 400,
			message: 'capacity is only allowed for THEORY_GROUP courses',
		});

		expect(prismaMock.course.update).not.toHaveBeenCalled();
	});
});
