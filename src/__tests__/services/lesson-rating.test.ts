import {
	LessonStatus,
	LessonType,
	Prisma,
	Role,
	type LessonRating,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createLessonRating,
	listLessonRatingsForManager,
	listOwnLessonRatingsForInstructor,
} from '../../services/lesson-rating.service';

const { prismaMock } = vi.hoisted(() => ({
	prismaMock: {
		drivingSchool: {
			findUnique: vi.fn(),
		},
		instructorProfile: {
			findFirst: vi.fn(),
		},
		lesson: {
			findFirst: vi.fn(),
		},
		lessonRating: {
			aggregate: vi.fn(),
			create: vi.fn(),
			findMany: vi.fn(),
		},
	},
}));

vi.mock('../../lib/prisma', () => ({
	getPrisma: () => prismaMock,
}));

const actor = {
	id: '11111111-1111-4111-8111-111111111111',
	role: Role.STUDENT,
};
const lessonId = '22222222-2222-4222-8222-222222222222';
const studentProfileId = '33333333-3333-4333-8333-333333333333';
const instructorProfileId = '44444444-4444-4444-8444-444444444444';
const managerActor = {
	id: '66666666-6666-4666-8666-666666666666',
	role: Role.MANAGER,
};
const schoolId = '77777777-7777-4777-8777-777777777777';

function mockLesson(
	overrides: {
		userId?: string;
		lessonType?: LessonType;
		status?: LessonStatus;
		hasRating?: boolean;
	} = {},
) {
	prismaMock.lesson.findFirst.mockResolvedValue({
		id: lessonId,
		studentId: studentProfileId,
		instructorId: instructorProfileId,
		lessonType: overrides.lessonType ?? LessonType.PRACTICE,
		status: overrides.status ?? LessonStatus.COMPLETED,
		studentProfile: {
			userId: overrides.userId ?? actor.id,
		},
		lessonRating: overrides.hasRating ? { id: 'rating-existing' } : null,
	});
}

function mockCreatedRating(overrides: Partial<LessonRating> = {}) {
	const row: LessonRating = {
		id: '55555555-5555-4555-8555-555555555555',
		lessonId,
		studentId: studentProfileId,
		instructorId: instructorProfileId,
		rating: 5,
		comment: 'Dobra lekcja',
		createdAt: new Date('2026-06-17T10:00:00.000Z'),
		...overrides,
	};
	prismaMock.lessonRating.create.mockResolvedValue(row);
	return row;
}

function mockRatingListRow(overrides: Partial<LessonRating> = {}) {
	return {
		id: '88888888-8888-4888-8888-888888888888',
		lessonId,
		studentId: studentProfileId,
		instructorId: instructorProfileId,
		rating: 4,
		comment: 'Spokojne podejście',
		createdAt: new Date('2026-06-17T12:00:00.000Z'),
		...overrides,
		lesson: {
			id: lessonId,
			startTime: new Date('2026-06-16T08:00:00.000Z'),
			endTime: new Date('2026-06-16T09:00:00.000Z'),
		},
		instructor: {
			id: instructorProfileId,
			userId: '99999999-9999-4999-8999-999999999999',
			user: {
				firstName: 'Anna',
				lastName: 'Nowak',
			},
		},
		student: {
			id: studentProfileId,
			userId: actor.id,
			user: {
				firstName: 'Jan',
				lastName: 'Kowalski',
			},
		},
	};
}

function mockManagerSchoolAccess() {
	prismaMock.drivingSchool.findUnique.mockResolvedValue({
		id: schoolId,
		ownerId: managerActor.id,
		deletedAt: null,
	});
}

function mockRatingsQueryResult() {
	prismaMock.lessonRating.findMany.mockResolvedValue([mockRatingListRow()]);
	prismaMock.lessonRating.aggregate.mockResolvedValue({
		_count: { _all: 3 },
		_avg: { rating: 4.3333 },
	});
}

describe('createLessonRating', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockLesson();
		mockCreatedRating();
		mockManagerSchoolAccess();
		mockRatingsQueryResult();
	});

	it('creates a lesson rating for the authenticated student lesson', async () => {
		await expect(
			createLessonRating(actor, lessonId, {
				rating: 5,
				comment: 'Dobra lekcja',
			}),
		).resolves.toEqual({
			rating: {
				id: '55555555-5555-4555-8555-555555555555',
				lessonId,
				instructorId: instructorProfileId,
				rating: 5,
				comment: 'Dobra lekcja',
				createdAt: '2026-06-17T10:00:00.000Z',
			},
		});

		expect(prismaMock.lesson.findFirst).toHaveBeenCalledWith({
			where: { id: lessonId, deletedAt: null },
			select: {
				id: true,
				studentId: true,
				instructorId: true,
				lessonType: true,
				status: true,
				studentProfile: {
					select: { userId: true },
				},
				lessonRating: {
					select: { id: true },
				},
			},
		});
		expect(prismaMock.lessonRating.create).toHaveBeenCalledWith({
			data: {
				lessonId,
				studentId: studentProfileId,
				instructorId: instructorProfileId,
				rating: 5,
				comment: 'Dobra lekcja',
			},
		});
	});

	it('throws 403 for non-student actors', async () => {
		await expect(
			createLessonRating({ id: actor.id, role: Role.MANAGER }, lessonId, {
				rating: 5,
				comment: null,
			}),
		).rejects.toMatchObject({
			statusCode: 403,
			message: 'Forbidden',
		});

		expect(prismaMock.lesson.findFirst).not.toHaveBeenCalled();
	});

	it('throws 404 when the lesson does not exist', async () => {
		prismaMock.lesson.findFirst.mockResolvedValue(null);

		await expect(
			createLessonRating(actor, lessonId, { rating: 5, comment: null }),
		).rejects.toMatchObject({
			statusCode: 404,
			message: 'Lesson not found',
		});
	});

	it('throws 403 when the lesson belongs to a different student', async () => {
		mockLesson({ userId: '99999999-9999-4999-8999-999999999999' });

		await expect(
			createLessonRating(actor, lessonId, { rating: 5, comment: null }),
		).rejects.toMatchObject({
			statusCode: 403,
			message: 'Forbidden',
		});
	});

	it('throws 400 when the lesson is not a practice lesson', async () => {
		mockLesson({ lessonType: LessonType.THEORY });

		await expect(
			createLessonRating(actor, lessonId, { rating: 5, comment: null }),
		).rejects.toMatchObject({
			statusCode: 400,
			message: 'Only practice lessons can be rated',
		});
	});

	it('throws 400 when the lesson is not completed', async () => {
		mockLesson({ status: LessonStatus.SCHEDULED });

		await expect(
			createLessonRating(actor, lessonId, { rating: 5, comment: null }),
		).rejects.toMatchObject({
			statusCode: 400,
			message: 'Only completed lessons can be rated',
		});
	});

	it('throws 409 when a rating already exists', async () => {
		mockLesson({ hasRating: true });

		await expect(
			createLessonRating(actor, lessonId, { rating: 5, comment: null }),
		).rejects.toMatchObject({
			statusCode: 409,
			message: 'Lesson rating already exists',
		});

		expect(prismaMock.lessonRating.create).not.toHaveBeenCalled();
	});

	it('maps unique constraint violations to 409', async () => {
		prismaMock.lessonRating.create.mockRejectedValue(
			new Prisma.PrismaClientKnownRequestError(
				'Unique constraint failed',
				{
					code: 'P2002',
					clientVersion: 'test',
				},
			),
		);

		await expect(
			createLessonRating(actor, lessonId, { rating: 5, comment: null }),
		).rejects.toMatchObject({
			statusCode: 409,
			message: 'Lesson rating already exists',
		});
	});
});

describe('listLessonRatingsForManager', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockManagerSchoolAccess();
		mockRatingsQueryResult();
	});

	it('returns manager-visible ratings with student data and summary', async () => {
		await expect(
			listLessonRatingsForManager(managerActor, {
				schoolId,
				instructorId: instructorProfileId,
				period: 'all',
				limit: 50,
			}),
		).resolves.toEqual({
			ratings: [
				{
					id: '88888888-8888-4888-8888-888888888888',
					lessonId,
					rating: 4,
					comment: 'Spokojne podejście',
					createdAt: '2026-06-17T12:00:00.000Z',
					lesson: {
						id: lessonId,
						startTime: '2026-06-16T08:00:00.000Z',
						endTime: '2026-06-16T09:00:00.000Z',
					},
					instructor: {
						id: instructorProfileId,
						userId: '99999999-9999-4999-8999-999999999999',
						firstName: 'Anna',
						lastName: 'Nowak',
					},
					student: {
						id: studentProfileId,
						userId: actor.id,
						firstName: 'Jan',
						lastName: 'Kowalski',
					},
				},
			],
			summary: {
				averageRating: 4.33,
				totalCount: 3,
			},
		});

		expect(prismaMock.lessonRating.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					instructorId: instructorProfileId,
					lesson: expect.objectContaining({
						lessonType: LessonType.PRACTICE,
						status: LessonStatus.COMPLETED,
						course: expect.objectContaining({ schoolId }),
					}),
				}),
				orderBy: { createdAt: 'desc' },
				take: 50,
			}),
		);
	});

	it('throws 403 when manager does not own the school', async () => {
		prismaMock.drivingSchool.findUnique.mockResolvedValue({
			id: schoolId,
			ownerId: '00000000-0000-4000-8000-000000000000',
			deletedAt: null,
		});

		await expect(
			listLessonRatingsForManager(managerActor, {
				schoolId,
				period: 'all',
				limit: 50,
			}),
		).rejects.toMatchObject({
			statusCode: 403,
			message: 'Forbidden',
		});
	});

	it('applies explicit date range to createdAt', async () => {
		await listLessonRatingsForManager(managerActor, {
			schoolId,
			period: 'latest',
			dateFrom: '2026-06-10',
			dateTo: '2026-06-11',
			limit: 20,
		});

		expect(prismaMock.lessonRating.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					createdAt: {
						gte: new Date('2026-06-10T00:00:00.000Z'),
						lt: new Date('2026-06-12T00:00:00.000Z'),
					},
				}),
			}),
		);
	});
});

describe('listOwnLessonRatingsForInstructor', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		prismaMock.instructorProfile.findFirst.mockResolvedValue({
			id: instructorProfileId,
		});
		mockRatingsQueryResult();
	});

	it('returns own instructor ratings without student data', async () => {
		await expect(
			listOwnLessonRatingsForInstructor({
				id: '99999999-9999-4999-8999-999999999999',
				role: Role.INSTRUCTOR,
			}),
		).resolves.toEqual({
			ratings: [
				expect.not.objectContaining({
					student: expect.anything(),
				}),
			],
		});

		expect(prismaMock.lessonRating.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					instructorId: instructorProfileId,
				}),
				take: 100,
			}),
		);
	});

	it('throws 403 for non-instructor actor', async () => {
		await expect(
			listOwnLessonRatingsForInstructor(managerActor),
		).rejects.toMatchObject({
			statusCode: 403,
			message: 'Forbidden',
		});
	});
});
