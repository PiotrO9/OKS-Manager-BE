import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const actor = vi.hoisted(() => ({ id: '' }));
vi.mock('../../lib/supabase', () => ({
	getSupabaseClient: () => ({
		auth: {
			getClaims: async () => ({
				data: { claims: { sub: actor.id } },
				error: null,
			}),
		},
	}),
}));
import { createApp } from '../../app';
import { getPrisma } from '../../lib/prisma';

const prisma = getPrisma();
const managerId = randomUUID();
const foreignManagerId = randomUUID();
const schoolId = randomUUID();
const foreignSchoolId = randomUUID();
const instructorId = randomUUID();
const instructorProfileId = randomUUID();
const foreignStudentId = randomUUID();
const foreignProfileId = randomUUID();
const students = Array.from({ length: 25 }, (_, index) => ({
	id: randomUUID(),
	profileId: randomUUID(),
	index,
}));
const userIds = [
	managerId,
	foreignManagerId,
	instructorId,
	foreignStudentId,
	...students.map((student) => student.id),
];
const sessions = new Map(
	[managerId, foreignManagerId, instructorId, students[0]!.id].map((id) => [
		id,
		randomUUID(),
	]),
);
let server: Server;
let base: string;

async function get(query: Record<string, string>, actorId = managerId) {
	actor.id = actorId;
	const sessionId = sessions.get(actorId);
	const token = `header.${Buffer.from(JSON.stringify({ session_id: sessionId })).toString('base64url')}.signature`;
	const response = await fetch(
		`${base}/manager/accounts?${new URLSearchParams({ schoolId, ...query })}`,
		{ headers: { authorization: `Bearer ${token}` } },
	);
	return {
		status: response.status,
		body: (await response.json()) as {
			data: {
				items: {
					id: string;
					phone?: string;
					isActive: boolean;
					deletedAt: string | null;
				}[];
				total: number;
				page: number;
				limit: number;
			};
		},
	};
}

describe('manager account search against PostgreSQL and HTTP', () => {
	beforeAll(async () => {
		await prisma.user.createMany({
			data: [
				{
					id: managerId,
					firstName: 'Manager',
					lastName: 'Test',
					email: `${managerId}@example.test`,
					role: 'MANAGER',
				},
				{
					id: foreignManagerId,
					firstName: 'Manager',
					lastName: 'Other',
					email: `${foreignManagerId}@example.test`,
					role: 'MANAGER',
				},
				{
					id: instructorId,
					firstName: 'Jan',
					lastName: 'Kowalski',
					email: `${instructorId}@example.test`,
					role: 'INSTRUCTOR',
				},
				{
					id: foreignStudentId,
					firstName: 'Jan',
					lastName: 'Kowalski',
					email: `${foreignStudentId}@example.test`,
					role: 'STUDENT',
				},
				...students.map(({ id, index }) => ({
					id,
					firstName:
						index === 0
							? 'Łukasz'
							: index === 2
								? 'Jan%'
								: index === 5
									? 'a_b'
									: index === 6
										? 'c\\d'
										: 'Jan',
					lastName:
						index === 0
							? 'Żółć'
							: [1, 2].includes(index)
								? 'Kowalski'
								: 'Nowak',
					email: `${id}@example.test`,
					role: 'STUDENT' as const,
					isActive: index !== 3,
					deletedAt: index === 4 ? new Date() : null,
				})),
			],
		});
		await prisma.accountSession.createMany({
			data: [...sessions].map(([userId, sessionId]) => ({
				userId,
				sessionId,
			})),
		});
		await prisma.drivingSchool.createMany({
			data: [
				{
					id: schoolId,
					name: 'Account search test',
					ownerId: managerId,
				},
				{
					id: foreignSchoolId,
					name: 'Foreign account search test',
					ownerId: foreignManagerId,
				},
			],
		});
		await prisma.studentProfile.createMany({
			data: [
				...students.map(({ id, profileId }) => ({
					id: profileId,
					userId: id,
				})),
				{ id: foreignProfileId, userId: foreignStudentId },
			],
		});
		await prisma.studentSchool.createMany({
			data: [
				...students.map(({ profileId }) => ({
					studentId: profileId,
					schoolId,
				})),
				{ studentId: foreignProfileId, schoolId: foreignSchoolId },
			],
		});
		await prisma.instructorProfile.create({
			data: {
				id: instructorProfileId,
				userId: instructorId,
				licenseNumber: instructorProfileId,
			},
		});
		await prisma.instructorSchool.create({
			data: { instructorId: instructorProfileId, schoolId },
		});
		server = createApp().listen(0, '127.0.0.1');
		await new Promise<void>((resolve, reject) => {
			server.once('listening', resolve);
			server.once('error', reject);
		});
		base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});
	afterAll(async () => {
		if (server)
			await new Promise<void>((resolve) => server.close(() => resolve()));
		await prisma.studentSchool.deleteMany({
			where: { schoolId: { in: [schoolId, foreignSchoolId] } },
		});
		await prisma.instructorSchool.deleteMany({ where: { schoolId } });
		await prisma.instructorProfile.deleteMany({
			where: { userId: instructorId },
		});
		await prisma.studentProfile.deleteMany({
			where: { userId: { in: userIds } },
		});
		await prisma.drivingSchool.deleteMany({
			where: { id: { in: [schoolId, foreignSchoolId] } },
		});
		await prisma.user.deleteMany({ where: { id: { in: userIds } } });
		await prisma.$disconnect();
	});

	it('paginates with a stable tie-breaker and counts only the owned school', async () => {
		const first = await get({ page: '1' });
		const second = await get({ page: '2' });
		expect(first.status).toBe(200);
		expect(first.body.data.total).toBe(26);
		expect(first.body.data.items).toHaveLength(20);
		expect(second.body.data.items).toHaveLength(6);
		const ids = [...first.body.data.items, ...second.body.data.items].map(
			({ id }) => id,
		);
		expect(new Set(ids).size).toBe(26);
		expect(ids).not.toContain(foreignStudentId);
		expect(first.body.data.items[0]).not.toHaveProperty('phone');
		expect((await get({ page: '1' })).body.data.items).toEqual(
			first.body.data.items,
		);
	});
	it('combines full names, case-insensitive search and role before counting', async () => {
		const result = await get({
			page: '1',
			search: '  kowalski JAN  ',
			role: 'STUDENT',
		});
		expect(result.body.data.total).toBe(2);
		expect(result.body.data.items.map(({ id }) => id).sort()).toEqual(
			[students[1]!.id, students[2]!.id].sort(),
		);
		const instructor = await get({
			page: '1',
			search: 'Jan Kowalski',
			role: 'INSTRUCTOR',
		});
		expect(instructor.body.data.items.map(({ id }) => id)).toEqual([
			instructorId,
		]);
	});
	it.each([
		['ŁUKASZ ŻÓŁĆ', 0],
		['%', 2],
		['_', 5],
		['\\', 6],
	])('searches literal text %s correctly', async (search, index) => {
		const result = await get({ page: '1', search: String(search) });
		expect(result.body.data.items.map(({ id }) => id)).toEqual([
			students[Number(index)]!.id,
		]);
	});
	it('keeps blocked and archived accounts visible', async () => {
		for (const index of [3, 4]) {
			const result = await get({
				page: '1',
				search: students[index]!.id,
			});
			expect(result.body.data.total).toBe(1);
			expect(result.body.data.items[0]!.id).toBe(students[index]!.id);
		}
	});
	it('resolves an instructor profile only in an accessible school', async () => {
		expect(
			(
				await get({ page: '1', profileId: instructorProfileId })
			).body.data.items.map(({ id }) => id),
		).toEqual([instructorId]);
		expect(
			(
				await get(
					{
						page: '1',
						profileId: instructorProfileId,
						schoolId: foreignSchoolId,
					},
					foreignManagerId,
				)
			).body.data.total,
		).toBe(0);
		expect(
			(await get({ page: '1', schoolId: foreignSchoolId })).status,
		).toBe(404);
	});
	it('preserves manager authorization for both roles', async () => {
		expect((await get({ page: '1' }, instructorId)).status).toBe(403);
		expect((await get({ page: '1' }, students[0]!.id)).status).toBe(403);
	});
	it('returns an empty page with the correct count beyond the last page', async () => {
		const result = await get({ page: '999' });
		expect(result.body.data).toEqual({
			items: [],
			total: 26,
			page: 999,
			limit: 20,
		});
	});
	it.each<Record<string, string>>([
		{ page: '0' },
		{ page: '1.2' },
		{ page: '1', limit: '101' },
		{ page: '1', role: 'ADMIN' },
		{ page: '1', search: 'a'.repeat(121) },
	])('rejects invalid query %j at HTTP boundary', async (query) => {
		expect((await get(query)).status).toBe(400);
	});
	it('retains the legacy full account response until old clients are retired', async () => {
		const result = await get({});
		expect(Array.isArray(result.body.data)).toBe(true);
		expect(result.body.data).toHaveLength(26);
		expect(result.body.data).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: instructorId,
					phone: null,
					accountActionsFor: [],
				}),
			]),
		);
	});
});
