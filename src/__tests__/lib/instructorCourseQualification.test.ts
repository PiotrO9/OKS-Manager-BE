import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	INSTRUCTOR_COURSE_QUALIFICATION_ERROR,
	assertInstructorQualifiedForCourse,
	assertInstructorQualifiedForCourseType,
	filterInstructorIdsQualifiedForCourseType,
} from '../../lib/instructorCourseQualification';

const { prismaMock } = vi.hoisted(() => ({
	prismaMock: {
		course: {
			findFirst: vi.fn(),
		},
		instructorProfile: {
			findFirst: vi.fn(),
			findMany: vi.fn(),
		},
	},
}));

vi.mock('../../lib/prisma', () => ({
	getPrisma: () => prismaMock,
}));

const courseId = '11111111-1111-4111-8111-111111111111';
const courseTypeId = '22222222-2222-4222-8222-222222222222';
const instructorId = '33333333-3333-4333-8333-333333333333';
const otherInstructorId = '44444444-4444-4444-8444-444444444444';

describe('instructor course qualification helpers', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('allows instructor with matching qualified course type', async () => {
		prismaMock.instructorProfile.findFirst.mockResolvedValue({
			id: instructorId,
		});

		await expect(
			assertInstructorQualifiedForCourseType(
				instructorId,
				courseTypeId,
			),
		).resolves.toBeUndefined();

		expect(prismaMock.instructorProfile.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					id: instructorId,
					qualifiedCourseTypes: { some: { id: courseTypeId } },
				}),
			}),
		);
	});

	it('rejects instructor without matching qualified course type', async () => {
		prismaMock.instructorProfile.findFirst.mockResolvedValue(null);

		await expect(
			assertInstructorQualifiedForCourseType(
				instructorId,
				courseTypeId,
			),
		).rejects.toMatchObject({
			statusCode: 400,
			message: INSTRUCTOR_COURSE_QUALIFICATION_ERROR,
		});
	});

	it('loads course type from course id before checking qualification', async () => {
		prismaMock.course.findFirst.mockResolvedValue({ courseTypeId });
		prismaMock.instructorProfile.findFirst.mockResolvedValue({
			id: instructorId,
		});

		await expect(
			assertInstructorQualifiedForCourse(instructorId, courseId),
		).resolves.toBeUndefined();

		expect(prismaMock.course.findFirst).toHaveBeenCalledWith({
			where: { id: courseId, deletedAt: null },
			select: { courseTypeId: true },
		});
	});

	it('returns only qualified instructor ids, preserving input order', async () => {
		prismaMock.instructorProfile.findMany.mockResolvedValue([
			{ id: otherInstructorId },
		]);

		await expect(
			filterInstructorIdsQualifiedForCourseType(
				[instructorId, otherInstructorId],
				courseTypeId,
			),
		).resolves.toEqual([otherInstructorId]);
	});
});
