import { LessonStatus, Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getStudentProcessStatus } from '../../services/students.service';

const { prismaMock } = vi.hoisted(() => ({
	prismaMock: {
		drivingSchool: {
			findFirst: vi.fn(),
		},
		instructorSchool: {
			findFirst: vi.fn(),
		},
		lesson: {
			findFirst: vi.fn(),
		},
		studentProfile: {
			findFirst: vi.fn(),
		},
	},
}));

vi.mock('../../lib/prisma', () => ({
	getPrisma: () => prismaMock,
}));

const actorId = '11111111-1111-4111-8111-111111111111';
const studentUserId = '22222222-2222-4222-8222-222222222222';
const schoolId = '33333333-3333-4333-8333-333333333333';
const studentProfileId = '44444444-4444-4444-8444-444444444444';

function mockStudent(overrides: {
	firstName?: string;
	lastName?: string;
	email?: string;
	isActive?: boolean;
	pkkNumber?: string | null;
	hasCourse?: boolean;
} = {}) {
	prismaMock.studentProfile.findFirst.mockResolvedValue({
		id: studentProfileId,
		pkkNumber: overrides.pkkNumber ?? null,
		user: {
			firstName: overrides.firstName ?? 'Jan',
			lastName: overrides.lastName ?? 'Kowalski',
			email: overrides.email ?? 'jan@example.com',
			isActive: overrides.isActive ?? true,
		},
		courseParticipants: overrides.hasCourse ? [{ id: 'cp-1' }] : [],
	});
}

function findStep(
	result: Awaited<ReturnType<typeof getStudentProcessStatus>>,
	name: string,
) {
	const step = result.steps.find((item) => item.name === name);
	if (!step) {
		throw new Error(`Missing step: ${name}`);
	}
	return step;
}

describe('getStudentProcessStatus', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		prismaMock.drivingSchool.findFirst.mockResolvedValue({ id: schoolId });
		prismaMock.instructorSchool.findFirst.mockResolvedValue({ id: 'is-1' });
		prismaMock.lesson.findFirst.mockResolvedValue(null);
		mockStudent();
	});

	it('returns incomplete optional process steps for a student without PKK, courses, and lessons', async () => {
		const result = await getStudentProcessStatus(
			studentUserId,
			Role.STUDENT,
			studentUserId,
			schoolId,
		);

		expect(findStep(result, 'Dane kursanta').completed).toBe(true);
		expect(findStep(result, 'Numer PKK').completed).toBe(false);
		expect(findStep(result, 'Przypisanie do kursu').completed).toBe(false);
		expect(findStep(result, 'Zaplanowanie jazd').completed).toBe(false);
	});

	it('marks PKK as completed when the student has a PKK number', async () => {
		mockStudent({ pkkNumber: '12345678901234567890' });

		const result = await getStudentProcessStatus(
			studentUserId,
			Role.STUDENT,
			studentUserId,
			schoolId,
		);

		expect(findStep(result, 'Numer PKK').completed).toBe(true);
	});

	it('marks course assignment as completed when the student has a course in the school', async () => {
		mockStudent({ hasCourse: true });

		const result = await getStudentProcessStatus(
			studentUserId,
			Role.STUDENT,
			studentUserId,
			schoolId,
		);

		expect(findStep(result, 'Przypisanie do kursu').completed).toBe(true);
	});

	it('marks lesson scheduling as completed when the student has a non-cancelled lesson in the school', async () => {
		prismaMock.lesson.findFirst.mockResolvedValue({ id: 'lesson-1' });

		const result = await getStudentProcessStatus(
			studentUserId,
			Role.STUDENT,
			studentUserId,
			schoolId,
		);

		expect(findStep(result, 'Zaplanowanie jazd').completed).toBe(true);
		expect(prismaMock.lesson.findFirst).toHaveBeenCalledWith({
			where: {
				studentId: studentProfileId,
				deletedAt: null,
				status: { not: LessonStatus.CANCELLED },
				course: { schoolId, deletedAt: null },
			},
			select: { id: true },
		});
	});

	it('does not mark lesson scheduling as completed when no non-cancelled lesson is found', async () => {
		prismaMock.lesson.findFirst.mockResolvedValue(null);

		const result = await getStudentProcessStatus(
			studentUserId,
			Role.STUDENT,
			studentUserId,
			schoolId,
		);

		expect(findStep(result, 'Zaplanowanie jazd').completed).toBe(false);
		expect(prismaMock.lesson.findFirst).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					status: { not: LessonStatus.CANCELLED },
				}),
			}),
		);
	});

	it('throws 403 when a student reads another student process status', async () => {
		await expect(
			getStudentProcessStatus(
				actorId,
				Role.STUDENT,
				studentUserId,
				schoolId,
			),
		).rejects.toMatchObject({
			statusCode: 403,
			message: 'Forbidden',
		});

		expect(prismaMock.studentProfile.findFirst).not.toHaveBeenCalled();
	});

	it('throws 403 when a manager has no access to the school', async () => {
		prismaMock.drivingSchool.findFirst.mockResolvedValue(null);

		await expect(
			getStudentProcessStatus(
				actorId,
				Role.MANAGER,
				studentUserId,
				schoolId,
			),
		).rejects.toMatchObject({
			statusCode: 403,
			message: 'Forbidden',
		});
	});

	it('throws 403 when an instructor has no access to the school', async () => {
		prismaMock.instructorSchool.findFirst.mockResolvedValue(null);

		await expect(
			getStudentProcessStatus(
				actorId,
				Role.INSTRUCTOR,
				studentUserId,
				schoolId,
			),
		).rejects.toMatchObject({
			statusCode: 403,
			message: 'Forbidden',
		});
	});

	it('throws 404 when the student is missing or not assigned to the school', async () => {
		prismaMock.studentProfile.findFirst.mockResolvedValue(null);

		await expect(
			getStudentProcessStatus(
				actorId,
				Role.ADMIN,
				studentUserId,
				schoolId,
			),
		).rejects.toMatchObject({
			statusCode: 404,
			message: 'Student not found',
		});
	});
});
