import { Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listStudentsForSchool } from '../../services/students/list';
import { listStudentsQuerySchema } from '../../lib/validation/studentSchemas';
import { buildStudentListWhere } from '../../services/students/listFilters';

const { db } = vi.hoisted(() => ({
	db: {
		drivingSchool: { findFirst: vi.fn() },
		course: { findFirst: vi.fn(), findMany: vi.fn() },
		studentProfile: { findMany: vi.fn(), count: vi.fn() },
		$transaction: vi.fn((queries: Promise<unknown>[]) =>
			Promise.all(queries),
		),
	},
}));
vi.mock('../../lib/prisma', () => ({ getPrisma: () => db }));
const schoolId = '33333333-3333-4333-8333-333333333333';
const courseId = '44444444-4444-4444-8444-444444444444';
const query = { schoolId, page: 2, limit: 20, filters: [] };

describe('students list search and views', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		db.drivingSchool.findFirst.mockResolvedValue({ id: schoolId });
		db.course.findMany.mockResolvedValue([]);
		db.studentProfile.findMany.mockResolvedValue([]);
		db.studentProfile.count.mockResolvedValue(21);
	});
	it('applies the same school-scoped search before pagination and counting', async () => {
		const result = await listStudentsForSchool('manager', Role.MANAGER, {
			...query,
			search: 'Jan Kowalski',
			view: 'without-pkk',
		});
		const args = db.studentProfile.findMany.mock.calls[0]![0];
		expect(args).toMatchObject({
			skip: 20,
			take: 20,
			where: {
				user: { deletedAt: null },
				studentSchools: { some: { schoolId } },
				AND: expect.arrayContaining([
					{ OR: [{ pkkNumber: null }, { pkkNumber: '' }] },
					{
						OR: expect.arrayContaining([
							{
								user: {
									firstName: {
										contains: 'Jan',
										mode: 'insensitive',
									},
								},
							},
						]),
					},
					{
						OR: expect.arrayContaining([
							{
								user: {
									lastName: {
										contains: 'Kowalski',
										mode: 'insensitive',
									},
								},
							},
						]),
					},
				]),
			},
		});
		expect(db.studentProfile.count).toHaveBeenCalledWith({
			where: args.where,
		});
		expect(result.total).toBe(21);
	});
	it('does not search data when manager has no access to the school', async () => {
		db.drivingSchool.findFirst.mockResolvedValue(null);
		await expect(
			listStudentsForSchool('manager', Role.MANAGER, {
				...query,
				search: 'Jan',
			}),
		).rejects.toThrow();
		expect(db.studentProfile.findMany).not.toHaveBeenCalled();
	});
	it('limits missing-course checks to nondeleted courses in this school', () => {
		expect(
			buildStudentListWhere({ ...query, view: 'without-course' }).AND,
		).toContainEqual({
			courseParticipants: {
				none: { course: { schoolId, deletedAt: null } },
			},
		});
	});
	it('ignores past, cancelled, theory and deleted lessons in the upcoming driving filter', () => {
		const now = new Date('2026-09-09T12:00:00Z');
		expect(
			buildStudentListWhere({ ...query, view: 'without-lesson' }, now)
				.AND,
		).toContainEqual({
			lessons: {
				none: {
					course: { schoolId, deletedAt: null },
					deletedAt: null,
					lessonType: 'PRACTICE',
					status: 'SCHEDULED',
					startTime: { gte: now },
				},
			},
		});
	});
	it('uses the payment-summary date boundary, excluding payments due today and paid payments', () => {
		expect(
			buildStudentListWhere(
				{ ...query, view: 'overdue' },
				new Date('2026-09-09T23:00:00Z'),
			).AND,
		).toContainEqual({
			courseParticipants: {
				some: {
					course: {
						schoolId,
						deletedAt: null,
						paymentPlans: {
							some: {
								payments: {
									some: {
										status: { not: 'PAID' },
										dueDate: {
											lt: new Date(
												'2026-09-09T00:00:00Z',
											),
										},
									},
								},
							},
						},
					},
				},
			},
		});
	});
	it('combines advanced filters with search and quick views', () => {
		const where = buildStudentListWhere({
			...query,
			search: 'Jan',
			view: 'without-pkk',
			filters: [
				{
					field: 'isActive',
					operator: 'neq',
					value: false,
				},
				{
					field: 'courseId',
					operator: 'neq',
					value: courseId,
				},
			],
		});

		expect(where.AND).toEqual(
			expect.arrayContaining([
				{ OR: [{ pkkNumber: null }, { pkkNumber: '' }] },
				{ user: { isActive: true } },
				{
					courseParticipants: {
						none: {
							courseId,
							course: { schoolId, deletedAt: null },
						},
					},
				},
			]),
		);
	});
	it('uses Prisma-compatible NOT shape for insensitive text negation', () => {
		const where = buildStudentListWhere({
			...query,
			filters: [
				{
					field: 'lastName',
					operator: 'not_contains',
					value: 'ski',
				},
				{
					field: 'pkkNumber',
					operator: 'neq',
					value: 'PKK000000047',
				},
			],
		});

		expect(where.AND).toEqual(
			expect.arrayContaining([
				{
					NOT: {
						user: {
							lastName: {
								contains: 'ski',
								mode: 'insensitive',
							},
						},
					},
				},
				{
					OR: [
						{ pkkNumber: null },
						{
							NOT: {
								pkkNumber: {
									equals: 'PKK000000047',
									mode: 'insensitive',
								},
							},
						},
					],
				},
			]),
		);
	});
	it('parses advanced filters from JSON query', () => {
		const parsed = listStudentsQuerySchema.parse({
			...query,
			filters: JSON.stringify([
				{
					field: 'createdAt',
					operator: 'between',
					value: ['2026-09-01', '2026-09-10'],
				},
			]),
		});

		expect(parsed.filters).toEqual([
			{
				field: 'createdAt',
				operator: 'between',
				value: ['2026-09-01', '2026-09-10'],
			},
		]);
		expect(
			listStudentsQuerySchema.safeParse({
				...query,
				filters: JSON.stringify([
					{
						field: 'createdAt',
						operator: 'between',
						value: ['2026-09-10', '2026-09-01'],
					},
				]),
			}).success,
		).toBe(false);
	});
	it('validates advanced course filters in one query', async () => {
		db.course.findMany.mockResolvedValue([{ id: courseId }]);

		await listStudentsForSchool('manager', Role.MANAGER, {
			...query,
			filters: [
				{
					field: 'courseId',
					operator: 'neq',
					value: courseId,
				},
				{
					field: 'courseId',
					operator: 'is_empty',
				},
			],
		});

		expect(db.course.findMany).toHaveBeenCalledWith({
			where: {
				id: { in: [courseId] },
				schoolId,
				deletedAt: null,
			},
			select: { id: true },
		});
	});
	it('validates filters and bounds search length', () => {
		expect(
			listStudentsQuerySchema.safeParse({ ...query, view: 'unknown' })
				.success,
		).toBe(false);
		expect(
			listStudentsQuerySchema.safeParse({
				...query,
				search: 'x'.repeat(121),
			}).success,
		).toBe(false);
		expect(
			listStudentsQuerySchema.parse({ ...query, search: ' Jan ' }).search,
		).toBe('Jan');
	});
});
