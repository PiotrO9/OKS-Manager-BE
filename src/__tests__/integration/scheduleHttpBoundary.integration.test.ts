import { Role } from '@prisma/client';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const authFixture = vi.hoisted(() => ({
	managerUserId: 'ed53af7e-e3f6-4da6-b6db-42935e32993f',
	studentUserId: '39866ac1-97fd-4fdf-b705-fe31037143d4',
	managerSessionId: globalThis.crypto.randomUUID(),
	studentSessionId: globalThis.crypto.randomUUID(),
	currentUserId: 'ed53af7e-e3f6-4da6-b6db-42935e32993f',
}));

function tokenForSession(sessionId: string): string {
	return `header.${Buffer.from(JSON.stringify({ session_id: sessionId })).toString('base64url')}.signature`;
}

vi.mock('../../lib/supabase', () => ({
	getSupabaseClient: () => ({
		auth: {
			getClaims: async () => ({
				data: { claims: { sub: authFixture.currentUserId } },
				error: null,
			}),
		},
	}),
}));

import { createApp } from '../../app';
import { getPrisma } from '../../lib/prisma';

const prisma = getPrisma();
let server: Server;
let baseUrl: string;

describe('schedule availability HTTP boundary', () => {
	beforeAll(async () => {
		await prisma.user.createMany({
			data: [
				{
					id: authFixture.managerUserId,
					firstName: 'HTTP',
					lastName: 'Manager',
					email: `schedule-http-${authFixture.managerUserId}@example.test`,
					role: Role.MANAGER,
				},
				{
					id: authFixture.studentUserId,
					firstName: 'HTTP',
					lastName: 'Student',
					email: `schedule-http-${authFixture.studentUserId}@example.test`,
					role: Role.STUDENT,
				},
			],
		});
		await prisma.accountSession.createMany({
			data: [
				{
					userId: authFixture.managerUserId,
					sessionId: authFixture.managerSessionId,
				},
				{
					userId: authFixture.studentUserId,
					sessionId: authFixture.studentSessionId,
				},
			],
		});

		server = createApp().listen(0, '127.0.0.1');
		await new Promise<void>((resolve, reject) => {
			server.once('listening', resolve);
			server.once('error', reject);
		});
		const address = server.address() as AddressInfo;
		baseUrl = `http://127.0.0.1:${address.port}`;
	});

	afterAll(async () => {
		if (server) {
			await new Promise<void>((resolve, reject) => {
				server.close((error) => (error ? reject(error) : resolve()));
			});
		}
		await prisma.user.deleteMany({
			where: {
				id: {
					in: [authFixture.managerUserId, authFixture.studentUserId],
				},
			},
		});
		await prisma.$disconnect();
	});

	it('passes through auth and rejects an invalid availability payload with the API error envelope', async () => {
		const response = await fetch(`${baseUrl}/schedule/availability-check`, {
			method: 'POST',
			headers: {
				authorization: `Bearer ${tokenForSession(authFixture.managerSessionId)}`,
				'content-type': 'application/json',
			},
			body: JSON.stringify({ intent: 'event_create' }),
		});

		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({
			success: false,
			error: 'Invalid input',
		});
	});

	it('allows a student request to reach lesson_self_book payload validation', async () => {
		authFixture.currentUserId = authFixture.studentUserId;

		try {
			const response = await fetch(
				`${baseUrl}/schedule/availability-check`,
				{
					method: 'POST',
					headers: {
						authorization: `Bearer ${tokenForSession(authFixture.studentSessionId)}`,
						'content-type': 'application/json',
					},
					body: JSON.stringify({ intent: 'lesson_self_book' }),
				},
			);

			expect(response.status).toBe(400);
			await expect(response.json()).resolves.toEqual({
				success: false,
				error: 'Invalid input',
			});
		} finally {
			authFixture.currentUserId = authFixture.managerUserId;
		}
	});
});
