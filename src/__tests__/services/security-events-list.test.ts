import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	db: {
		drivingSchool: { findFirst: vi.fn() },
		securityEventSchool: { findMany: vi.fn(), findFirst: vi.fn() },
	},
}));
vi.mock('../../lib/prisma', () => ({ getPrisma: () => mocks.db }));

import {
	getManagerSecurityLog,
	listManagerSecurityLogs,
} from '../../services/security-events/list';

const actorId = '11111111-1111-4111-8111-111111111111';
const schoolId = '22222222-2222-4222-8222-222222222222';
const eventId = '33333333-3333-4333-8333-333333333333';
const listInput = {
	schoolId,
	limit: 20,
	search: '',
	view: 'all',
	filters: { rules: [] },
};

describe('manager security log visibility', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.db.drivingSchool.findFirst.mockResolvedValue({ id: schoolId });
		mocks.db.securityEventSchool.findMany.mockResolvedValue([]);
	});

	it('checks school ownership before list, detail, or filter data', async () => {
		mocks.db.drivingSchool.findFirst.mockResolvedValue(null);
		await expect(
			listManagerSecurityLogs(actorId, listInput),
		).rejects.toMatchObject({ statusCode: 404 });
		await expect(
			getManagerSecurityLog(actorId, schoolId, eventId),
		).rejects.toMatchObject({ statusCode: 404 });
		expect(mocks.db.securityEventSchool.findMany).not.toHaveBeenCalled();
		expect(mocks.db.securityEventSchool.findFirst).not.toHaveBeenCalled();
	});

	it('filters through school projection and binds viewer to the current manager', async () => {
		await listManagerSecurityLogs(actorId, {
			...listInput,
			search: 'Jan',
			filters: {
				rules: [
					{
						field: 'actorRole' as const,
						operator: 'is' as const,
						value: 'STUDENT',
					},
				],
			},
		});
		const query = mocks.db.securityEventSchool.findMany.mock.calls[0][0];
		expect(query.where.schoolId).toBe(schoolId);
		expect(query.where.AND).toContainEqual({
			OR: [{ viewerUserId: null }, { viewerUserId: actorId }],
		});
		expect(query.where.AND).toContainEqual({
			actorRole: { equals: 'STUDENT' },
		});
		expect(query.where.AND).toContainEqual({
			OR: expect.arrayContaining([
				{ actorDisplayName: { contains: 'Jan', mode: 'insensitive' } },
			]),
		});
		expect(JSON.stringify(query.where)).not.toContain('actorRoleSnapshot');
	});

	it('returns a safe external actor projection from detail', async () => {
		mocks.db.securityEventSchool.findFirst.mockResolvedValue({
			eventId,
			schoolId,
			occurredAt: new Date('2026-10-18T12:00:00Z'),
			actorVisibility: 'EXTERNAL',
			actorUserId: null,
			actorDisplayName: 'Użytkownik zewnętrzny',
			actorRole: null,
			targetUserId: null,
			targetDisplayName: null,
			event: {
				type: 'ACCESS_DENIED',
				category: 'ACCESS',
				severity: 'WARNING',
				outcome: 'DENIED',
				reasonCode: 'SCHOOL_SCOPE',
				operationCode: 'students.list',
				operationLabelSnapshot: 'Lista kursantów',
				httpMethod: 'GET',
				routeTemplate: '/students',
				httpStatus: 403,
				clientIp: null,
				requestId: null,
				userAgent: null,
				ipSource: null,
				resourceType: null,
				resourceId: null,
				metadata: {},
				actorUserId: '44444444-4444-4444-8444-444444444444',
				actorDisplayNameSnapshot: 'Sekret',
			},
		});
		const detail = await getManagerSecurityLog(actorId, schoolId, eventId);
		expect(detail.actor).toEqual({
			visibility: 'EXTERNAL',
			userId: null,
			displayName: 'Użytkownik zewnętrzny',
			role: null,
		});
		expect(JSON.stringify(detail)).not.toContain('Sekret');
		expect(JSON.stringify(detail)).not.toContain(
			'44444444-4444-4444-8444-444444444444',
		);
	});
});

function row(index: number, at = '2026-10-18T12:00:00Z') {
	return {
		eventId: '33333333-3333-4333-8333-' + String(index).padStart(12, '0'),
		schoolId,
		occurredAt: new Date(at),
		actorVisibility: 'UNKNOWN',
		actorUserId: null,
		actorDisplayName: null,
		actorRole: null,
		targetUserId: null,
		targetDisplayName: null,
		event: {
			type: 'LOGIN_FAILED',
			category: 'AUTH',
			severity: 'WARNING',
			outcome: 'FAILURE',
		},
	};
}
describe('security log cursor and filter contract', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		vi.stubEnv('SECURITY_LOG_CURSOR_SECRET', 'c'.repeat(32));
		mocks.db.drivingSchool.findFirst.mockResolvedValue({ id: schoolId });
		mocks.db.securityEventSchool.findMany.mockResolvedValue([]);
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
	});
	async function firstPage() {
		mocks.db.securityEventSchool.findMany.mockResolvedValueOnce([
			row(3),
			row(2),
			row(1),
		]);
		return listManagerSecurityLogs(actorId, { ...listInput, limit: 2 });
	}
	it('paginates tied timestamps in both directions with a stable event id boundary', async () => {
		const first = await firstPage();
		expect(first.items.map((x) => x.id)).toEqual([
			row(3).eventId,
			row(2).eventId,
		]);
		expect(first.pageInfo).toMatchObject({
			hasNextPage: true,
			hasPreviousPage: false,
			previousCursor: null,
		});
		mocks.db.securityEventSchool.findMany.mockResolvedValueOnce([row(1)]);
		const second = await listManagerSecurityLogs(actorId, {
			...listInput,
			limit: 2,
			cursor: first.pageInfo.nextCursor!,
		});
		expect(
			mocks.db.securityEventSchool.findMany.mock.lastCall![0],
		).toMatchObject({
			take: 3,
			orderBy: [{ occurredAt: 'desc' }, { eventId: 'desc' }],
			where: {
				AND: expect.arrayContaining([
					{
						OR: [
							{ occurredAt: { lt: row(2).occurredAt } },
							{
								occurredAt: row(2).occurredAt,
								eventId: { lt: row(2).eventId },
							},
						],
					},
				]),
			},
		});
		expect(second.pageInfo).toMatchObject({
			hasNextPage: false,
			hasPreviousPage: true,
		});
		mocks.db.securityEventSchool.findMany.mockResolvedValueOnce([
			row(2),
			row(3),
		]);
		const back = await listManagerSecurityLogs(actorId, {
			...listInput,
			limit: 2,
			cursor: second.pageInfo.previousCursor!,
		});
		expect(back.items.map((x) => x.id)).toEqual(
			first.items.map((x) => x.id),
		);
		expect(back.pageInfo).toMatchObject({
			hasNextPage: true,
			hasPreviousPage: false,
		});
		expect(
			mocks.db.securityEventSchool.findMany.mock.lastCall![0].orderBy,
		).toEqual([{ occurredAt: 'asc' }, { eventId: 'asc' }]);
	});
	it.each([0, 2])(
		'returns no next cursor for %i rows at limit two',
		async (count) => {
			mocks.db.securityEventSchool.findMany.mockResolvedValueOnce(
				Array.from({ length: count }, (_, i) => row(i)),
			);
			const page = await listManagerSecurityLogs(actorId, {
				...listInput,
				limit: 2,
			});
			expect(page.pageInfo).toEqual({
				nextCursor: null,
				previousCursor: null,
				hasNextPage: false,
				hasPreviousPage: false,
			});
		},
	);
	it('rejects tampered and expired cursors before querying events', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-18T12:00:00Z'));
		const page = await firstPage();
		const cursor = page.pageInfo.nextCursor!;
		mocks.db.securityEventSchool.findMany.mockClear();
		for (const invalid of [
			'x' + cursor,
			cursor.split('.')[0] + '.AAAA',
			'invalid',
		])
			await expect(
				listManagerSecurityLogs(actorId, {
					...listInput,
					limit: 2,
					cursor: invalid,
				}),
			).rejects.toMatchObject({ statusCode: 400 });
		vi.advanceTimersByTime(15 * 60_000 + 1);
		await expect(
			listManagerSecurityLogs(actorId, {
				...listInput,
				limit: 2,
				cursor,
			}),
		).rejects.toMatchObject({ statusCode: 400 });
		expect(mocks.db.securityEventSchool.findMany).not.toHaveBeenCalled();
	});
	it.each([
		{ schoolId: eventId },
		{ search: 'other' },
		{ view: 'suspicious' },
		{ limit: 3 },
		{
			filters: {
				rules: [
					{ field: 'actorRole', operator: 'is', value: 'STUDENT' },
				],
			},
		},
	] as const)('binds cursors to the query %j', async (change) => {
		const page = await firstPage();
		await expect(
			listManagerSecurityLogs(actorId, {
				...listInput,
				limit: 2,
				...change,
				cursor: page.pageInfo.nextCursor!,
			} as Parameters<typeof listManagerSecurityLogs>[1]),
		).rejects.toMatchObject({ statusCode: 400 });
	});
	it('binds cursors to the viewer', async () => {
		const page = await firstPage();
		await expect(
			listManagerSecurityLogs(eventId, {
				...listInput,
				limit: 2,
				cursor: page.pageInfo.nextCursor!,
			}),
		).rejects.toMatchObject({ statusCode: 400 });
	});
	it.each([
		['2026-03-29', '2026-03-28T23:00:00Z', '2026-03-29T22:00:00Z'],
		['2026-10-25', '2026-10-24T22:00:00Z', '2026-10-25T23:00:00Z'],
	])('uses Warsaw calendar boundaries on %s', async (date, start, end) => {
		await listManagerSecurityLogs(actorId, {
			...listInput,
			filters: {
				rules: [{ field: 'occurredAt', operator: 'on', value: date }],
			},
		});
		expect(
			mocks.db.securityEventSchool.findMany.mock.lastCall![0].where.AND,
		).toContainEqual({
			occurredAt: { gte: new Date(start!), lt: new Date(end!) },
		});
	});
	it('keeps projection filters separate from event fields', async () => {
		await listManagerSecurityLogs(actorId, {
			...listInput,
			filters: {
				rules: [
					{ field: 'actorRole', operator: 'is', value: 'STUDENT' },
					{ field: 'httpStatus', operator: 'is', value: '401' },
				],
			},
		});
		expect(
			mocks.db.securityEventSchool.findMany.mock.lastCall![0].where.AND,
		).toEqual(
			expect.arrayContaining([
				{ actorRole: { equals: 'STUDENT' } },
				{ event: { httpStatus: { equals: 401 } } },
			]),
		);
	});
});
