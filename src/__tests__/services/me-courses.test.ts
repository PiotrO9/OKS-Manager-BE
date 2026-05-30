import { CourseParticipantStatus, Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { courseService } from '../../services/course.service';

const { prismaMock } = vi.hoisted(() => ({
	prismaMock: {
		courseParticipant: {
			findMany: vi.fn(),
		},
	},
}));

vi.mock('../../lib/prisma', () => ({
	getPrisma: () => prismaMock,
}));

const userId = '11111111-1111-1111-1111-111111111111';

describe('courseService.listCoursesForCurrentUser', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns courses for a student', async () => {
		prismaMock.courseParticipant.findMany.mockResolvedValue([
			{
				status: CourseParticipantStatus.ACTIVE,
				course: {
					id: '22222222-2222-2222-2222-222222222222',
					name: 'Kurs B',
				},
			},
			{
				status: CourseParticipantStatus.FINISHED,
				course: {
					id: '33333333-3333-3333-3333-333333333333',
					name: 'Kurs A',
				},
			},
		]);

		await expect(
			courseService.listCoursesForCurrentUser(userId, Role.STUDENT),
		).resolves.toEqual([
			{
				id: '22222222-2222-2222-2222-222222222222',
				name: 'Kurs B',
				status: CourseParticipantStatus.ACTIVE,
			},
			{
				id: '33333333-3333-3333-3333-333333333333',
				name: 'Kurs A',
				status: CourseParticipantStatus.FINISHED,
			},
		]);
	});

	it('returns an empty array for a student without courses', async () => {
		prismaMock.courseParticipant.findMany.mockResolvedValue([]);

		await expect(
			courseService.listCoursesForCurrentUser(userId, Role.STUDENT),
		).resolves.toEqual([]);
	});

	it('filters out soft-deleted courses in the query', async () => {
		prismaMock.courseParticipant.findMany.mockResolvedValue([]);

		await courseService.listCoursesForCurrentUser(userId, Role.STUDENT);

		expect(prismaMock.courseParticipant.findMany).toHaveBeenCalledWith({
			where: {
				student: { userId },
				course: { deletedAt: null },
			},
			orderBy: { createdAt: 'asc' },
			select: {
				status: true,
				course: {
					select: {
						id: true,
						name: true,
					},
				},
			},
		});
	});

	it('returns an empty array for non-student roles without querying courses', async () => {
		await expect(
			courseService.listCoursesForCurrentUser(userId, Role.MANAGER),
		).resolves.toEqual([]);

		expect(prismaMock.courseParticipant.findMany).not.toHaveBeenCalled();
	});
});
