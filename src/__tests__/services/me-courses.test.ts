import {
	CourseKind,
	CourseParticipantStatus,
	LessonStatus,
	LessonType,
	Role,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { courseService } from '../../services/course.service';

const { prismaMock } = vi.hoisted(() => ({
	prismaMock: {
		courseParticipant: {
			findMany: vi.fn(),
		},
		lesson: {
			findMany: vi.fn(),
		},
	},
}));

vi.mock('../../lib/prisma', () => ({
	getPrisma: () => prismaMock,
}));

const userId = '11111111-1111-1111-1111-111111111111';
const studentId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function lessonTimeRange(
	courseId: string,
	start: string,
	end: string,
): { courseId: string; startTime: Date; endTime: Date } {
	return {
		courseId,
		startTime: new Date(start),
		endTime: new Date(end),
	};
}

describe('courseService.listCoursesForCurrentUser', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		prismaMock.lesson.findMany.mockResolvedValue([]);
	});

	it('returns courses for a student', async () => {
		prismaMock.courseParticipant.findMany.mockResolvedValue([
			{
				studentId,
				status: CourseParticipantStatus.ACTIVE,
				course: {
					id: '22222222-2222-2222-2222-222222222222',
					name: 'Kurs B',
					kind: CourseKind.PRACTICAL,
					totalHours: 30,
				},
			},
			{
				studentId,
				status: CourseParticipantStatus.FINISHED,
				course: {
					id: '33333333-3333-3333-3333-333333333333',
					name: 'Kurs A',
					kind: CourseKind.THEORY_GROUP,
					totalHours: 30,
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
				progress: 0,
			},
			{
				id: '33333333-3333-3333-3333-333333333333',
				name: 'Kurs A',
				status: CourseParticipantStatus.FINISHED,
				progress: 0,
			},
		]);
	});

	it('returns an empty array for a student without courses', async () => {
		prismaMock.courseParticipant.findMany.mockResolvedValue([]);

		await expect(
			courseService.listCoursesForCurrentUser(userId, Role.STUDENT),
		).resolves.toEqual([]);

		expect(prismaMock.lesson.findMany).not.toHaveBeenCalled();
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
				studentId: true,
				status: true,
				course: {
					select: {
						id: true,
						name: true,
						kind: true,
						totalHours: true,
					},
				},
			},
		});
	});

	it('calculates progress from completed practice lesson minutes', async () => {
		const courseId = '22222222-2222-2222-2222-222222222222';
		prismaMock.courseParticipant.findMany.mockResolvedValue([
			{
				studentId,
				status: CourseParticipantStatus.ACTIVE,
				course: {
					id: courseId,
					name: 'Kurs B',
					kind: CourseKind.PRACTICAL,
					totalHours: 4,
				},
			},
		]);
		prismaMock.lesson.findMany.mockResolvedValue([
			lessonTimeRange(
				courseId,
				'2026-06-01T08:00:00.000Z',
				'2026-06-01T10:00:00.000Z',
			),
		]);

		await expect(
			courseService.listCoursesForCurrentUser(userId, Role.STUDENT),
		).resolves.toEqual([
			{
				id: courseId,
				name: 'Kurs B',
				status: CourseParticipantStatus.ACTIVE,
				progress: 50,
			},
		]);
	});

	it('caps progress at 100', async () => {
		const courseId = '22222222-2222-2222-2222-222222222222';
		prismaMock.courseParticipant.findMany.mockResolvedValue([
			{
				studentId,
				status: CourseParticipantStatus.ACTIVE,
				course: {
					id: courseId,
					name: 'Kurs B',
					kind: CourseKind.EXTRA,
					totalHours: 1,
				},
			},
		]);
		prismaMock.lesson.findMany.mockResolvedValue([
			lessonTimeRange(
				courseId,
				'2026-06-01T08:00:00.000Z',
				'2026-06-01T10:00:00.000Z',
			),
		]);

		await expect(
			courseService.listCoursesForCurrentUser(userId, Role.STUDENT),
		).resolves.toEqual([
			{
				id: courseId,
				name: 'Kurs B',
				status: CourseParticipantStatus.ACTIVE,
				progress: 100,
			},
		]);
	});

	it('returns 0 progress for theory courses without querying lessons', async () => {
		prismaMock.courseParticipant.findMany.mockResolvedValue([
			{
				studentId,
				status: CourseParticipantStatus.ACTIVE,
				course: {
					id: '33333333-3333-3333-3333-333333333333',
					name: 'Teoria B',
					kind: CourseKind.THEORY_GROUP,
					totalHours: 30,
				},
			},
		]);

		await expect(
			courseService.listCoursesForCurrentUser(userId, Role.STUDENT),
		).resolves.toEqual([
			{
				id: '33333333-3333-3333-3333-333333333333',
				name: 'Teoria B',
				status: CourseParticipantStatus.ACTIVE,
				progress: 0,
			},
		]);

		expect(prismaMock.lesson.findMany).not.toHaveBeenCalled();
	});

	it('queries only completed active practice lessons for progress', async () => {
		const courseId = '22222222-2222-2222-2222-222222222222';
		prismaMock.courseParticipant.findMany.mockResolvedValue([
			{
				studentId,
				status: CourseParticipantStatus.ACTIVE,
				course: {
					id: courseId,
					name: 'Kurs B',
					kind: CourseKind.PRACTICAL,
					totalHours: 30,
				},
			},
		]);

		await courseService.listCoursesForCurrentUser(userId, Role.STUDENT);

		expect(prismaMock.lesson.findMany).toHaveBeenCalledWith({
			where: {
				courseId: { in: [courseId] },
				studentId: { in: [studentId] },
				status: LessonStatus.COMPLETED,
				lessonType: LessonType.PRACTICE,
				deletedAt: null,
			},
			select: {
				courseId: true,
				startTime: true,
				endTime: true,
			},
		});
	});

	it('returns an empty array for non-student roles without querying courses', async () => {
		await expect(
			courseService.listCoursesForCurrentUser(userId, Role.MANAGER),
		).resolves.toEqual([]);

		expect(prismaMock.courseParticipant.findMany).not.toHaveBeenCalled();
		expect(prismaMock.lesson.findMany).not.toHaveBeenCalled();
	});
});
