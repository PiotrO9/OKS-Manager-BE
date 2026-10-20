import { beforeEach, describe, expect, it, vi } from 'vitest';
import { managerAccountsQuerySchema } from '../../lib/validation/managerAccountSchemas';

const db = vi.hoisted(() => ({
	drivingSchool: { findFirst: vi.fn(), findUnique: vi.fn() },
	user: { findMany: vi.fn(), count: vi.fn() },
	$transaction: vi.fn(),
}));
vi.mock('../../lib/prisma', () => ({ getPrisma: () => db }));
vi.mock('../../lib/supabase', () => ({ getSupabaseClient: vi.fn() }));
vi.mock('../../lib/supabaseAdmin', () => ({ getSupabaseAdminClient: vi.fn() }));
vi.mock('../../services/security-events/record', () => ({
	recordSecurityEvent: vi.fn(),
}));
import {
	listManagerAccounts,
	searchManagerAccounts,
} from '../../services/managerAccounts.service';

const actorId = '11111111-1111-4111-8111-111111111111';
const schoolId = '22222222-2222-4222-8222-222222222222';
const profileId = '33333333-3333-4333-8333-333333333333';

describe('manager account search', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		db.drivingSchool.findFirst.mockResolvedValue({ id: schoolId });
		db.user.findMany.mockResolvedValue([]);
		db.user.count.mockResolvedValue(0);
		db.$transaction.mockImplementation((run: (tx: typeof db) => unknown) =>
			run(db),
		);
	});

	it('applies school scope, role, every search term, count and pagination together', async () => {
		db.user.count.mockResolvedValue(41);
		const result = await searchManagerAccounts(actorId, {
			schoolId,
			page: 3,
			limit: 20,
			role: 'STUDENT',
			search: 'Jan Kowalski',
		});
		expect(result).toEqual({ items: [], total: 41, page: 3, limit: 20 });
		const query = db.user.findMany.mock.calls[0]![0];
		expect(query).toMatchObject({
			skip: 40,
			take: 20,
			orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
		});
		expect(query.where.AND[0]).toEqual({
			OR: [
				{
					role: 'STUDENT',
					studentProfile: { studentSchools: { some: { schoolId } } },
				},
				{
					role: 'INSTRUCTOR',
					instructorProfile: {
						instructorSchools: { some: { schoolId } },
					},
				},
			],
		});
		expect(query.where.AND.slice(1)).toEqual([
			{ role: 'STUDENT' },
			...['Jan', 'Kowalski'].map((contains) => ({
				OR: ['firstName', 'lastName', 'email'].map((field) => ({
					[field]: { contains, mode: 'insensitive' },
				})),
			})),
		]);
		expect(db.user.count).toHaveBeenCalledWith({ where: query.where });
		expect(query.select).not.toHaveProperty('phone');
		expect(query.select).not.toHaveProperty('accountActionsFor');
		expect(db.$transaction.mock.calls[0]![1]).toEqual({
			isolationLevel: 'RepeatableRead',
		});
	});

	it('does not execute list or count for a foreign school', async () => {
		db.drivingSchool.findFirst.mockResolvedValue(null);
		await expect(
			searchManagerAccounts(actorId, { schoolId, page: 1, limit: 20 }),
		).rejects.toMatchObject({ statusCode: 404 });
		expect(db.user.findMany).not.toHaveBeenCalled();
		expect(db.user.count).not.toHaveBeenCalled();
	});

	it('looks up the instructor profile within the same school scope', async () => {
		await searchManagerAccounts(actorId, {
			schoolId,
			page: 1,
			limit: 1,
			profileId,
		});
		expect(db.user.findMany.mock.calls[0]![0].where.AND).toContainEqual({
			instructorProfile: { id: profileId },
		});
	});

	it('escapes LIKE wildcard and escape characters in user input', async () => {
		await searchManagerAccounts(actorId, {
			schoolId,
			page: 1,
			limit: 20,
			search: '100% a_b c\\d',
		});
		const terms = db.user.findMany.mock.calls[0]![0].where.AND.slice(1);
		expect(
			terms.map(
				(term: { OR: { firstName: { contains: string } }[] }) =>
					term.OR[0]!.firstName.contains,
			),
		).toEqual(['100\\%', 'a\\_b', 'c\\\\d']);
	});

	it('keeps the full account shape for legacy clients without pagination', async () => {
		await listManagerAccounts(actorId, schoolId);
		expect(db.user.findMany.mock.calls[0]![0]).toMatchObject({
			select: { phone: true, accountActionsFor: expect.any(Object) },
		});
		expect(db.user.count).not.toHaveBeenCalled();
	});

	it.each([
		{ page: '0' },
		{ page: '1.5' },
		{ page: '1000001' },
		{ limit: '101' },
		{ limit: '0' },
		{ role: 'MANAGER' },
		{ search: 'x'.repeat(121) },
		{ schoolId: 'invalid' },
		{ profileId: 'invalid' },
		{ search: ['Jan', 'Anna'] },
	])('rejects invalid query %j', (invalid) => {
		expect(
			managerAccountsQuerySchema.safeParse({
				schoolId,
				page: '1',
				...invalid,
			}).success,
		).toBe(false);
	});
	it('normalizes query values and defaults the page size', () => {
		expect(
			managerAccountsQuerySchema.parse({
				schoolId,
				page: '1',
				search: '  Jan  ',
			}),
		).toEqual({ schoolId, page: 1, limit: 20, search: 'Jan' });
	});

	it.each([{ search: 'Jan' }, { role: 'STUDENT' }, { profileId }])(
		'requires pagination when filters are supplied: %j',
		(filter) => {
			expect(
				managerAccountsQuerySchema.safeParse({ schoolId, ...filter })
					.success,
			).toBe(false);
		},
	);
});
