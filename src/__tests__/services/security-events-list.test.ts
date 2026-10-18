import { beforeEach, describe, expect, it, vi } from 'vitest';

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
