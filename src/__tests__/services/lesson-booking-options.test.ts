import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '@prisma/client';

const mocks = vi.hoisted(() => ({
	assertAccess: vi.fn(),
	instructors: vi.fn(),
	count: vi.fn(),
	findMany: vi.fn(),
}));
vi.mock('../../lib/prisma', () => ({
	getPrisma: () => ({
		instructorProfile: { findMany: mocks.instructors },
		studentProfile: { count: mocks.count, findMany: mocks.findMany },
		$transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
	}),
}));
vi.mock('../../services/lesson/bookingAccess', () => ({
	assertActorCanBookLessonForCourse: mocks.assertAccess,
}));

import { getLessonBookingOptions } from '../../services/lesson/bookingOptions';

const actor = { id: 'manager', role: Role.MANAGER };
const query = {
	schoolId: 'school',
	instructorIds: ['instructor'],
	q: '',
	page: 1,
	limit: 20,
};

describe('lesson booking options', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.instructors.mockResolvedValue([
			{
				id: 'instructor',
				qualifiedCourseTypes: [{ id: 'type-a' }, { id: 'type-b' }],
			},
		]);
		mocks.count.mockResolvedValue(1);
		mocks.findMany.mockResolvedValue([
			{
				userId: 'student-b-c',
				user: {
					firstName: 'Jan',
					lastName: 'Nowak',
					email: 'jan@example.com',
				},
				courseParticipants: [
					{
						course: {
							id: 'course-b',
							name: 'B',
							category: 'B',
							kind: 'PRACTICAL',
						},
					},
				],
			},
		]);
	});

	it('restricts students and their courses to active practice in qualified categories', async () => {
		const result = await getLessonBookingOptions(actor, query);
		const where = mocks.findMany.mock.calls[0]![0].where;
		expect(mocks.assertAccess).toHaveBeenCalledWith(actor, 'school');
		expect(where.courseParticipants.some.course.courseTypeId.in).toEqual([
			'type-a',
			'type-b',
		]);
		expect(where.courseParticipants.some.course.schoolId).toBe('school');
		expect(where.courseParticipants.some.course.kind.in).toEqual([
			'PRACTICAL',
			'EXTRA',
		]);
		expect(where.courseParticipants.some.status).toBe('ACTIVE');
		expect(
			mocks.findMany.mock.calls[0]![0].select.courseParticipants.where,
		).toEqual(where.courseParticipants.some);
		expect(result.items).toEqual([
			{
				userId: 'student-b-c',
				firstName: 'Jan',
				lastName: 'Nowak',
				email: 'jan@example.com',
				courses: [
					{
						id: 'course-b',
						name: 'B',
						category: 'B',
						kind: 'PRACTICAL',
						status: 'ACTIVE',
					},
				],
			},
		]);
	});

	it('finds a student by full name and returns email for identification', async () => {
		await getLessonBookingOptions(actor, { ...query, q: 'Jan Nowak' });
		const userWhere = mocks.findMany.mock.calls[0]![0].where.user;
		expect(userWhere.OR).toEqual(
			expect.arrayContaining([
				{
					AND: [
						{ firstName: { contains: 'Jan', mode: 'insensitive' } },
						{
							lastName: {
								contains: 'Nowak',
								mode: 'insensitive',
							},
						},
					],
				},
			]),
		);
		expect(mocks.findMany.mock.calls[0]![0].select.user.select.email).toBe(
			true,
		);
	});

	it('returns no students for an instructor without qualifications', async () => {
		mocks.instructors.mockResolvedValue([
			{ id: 'instructor', qualifiedCourseTypes: [] },
		]);
		expect((await getLessonBookingOptions(actor, query)).items).toEqual([]);
		expect(mocks.findMany).not.toHaveBeenCalled();
	});

	it('rejects an instructor outside the school', async () => {
		mocks.instructors.mockResolvedValue([]);
		await expect(getLessonBookingOptions(actor, query)).rejects.toThrow();
		expect(mocks.findMany).not.toHaveBeenCalled();
	});
});
