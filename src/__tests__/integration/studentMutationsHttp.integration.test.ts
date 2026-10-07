import { CourseKind, CourseParticipantStatus, Role } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const ids = vi.hoisted(() => ({
	admin: globalThis.crypto.randomUUID(),
	manager: globalThis.crypto.randomUUID(),
	otherManager: globalThis.crypto.randomUUID(),
	instructorUser: globalThis.crypto.randomUUID(),
	instructorProfile: globalThis.crypto.randomUUID(),
	studentUser: globalThis.crypto.randomUUID(),
	studentProfile: globalThis.crypto.randomUUID(),
	otherStudentUser: globalThis.crypto.randomUUID(),
	otherStudentProfile: globalThis.crypto.randomUUID(),
	inactiveUser: globalThis.crypto.randomUUID(),
	inactiveProfile: globalThis.crypto.randomUUID(),
	deletedUser: globalThis.crypto.randomUUID(),
	deletedProfile: globalThis.crypto.randomUUID(),
	noProfileUser: globalThis.crypto.randomUUID(),
	school: globalThis.crypto.randomUUID(),
	otherSchool: globalThis.crypto.randomUUID(),
	courseType: globalThis.crypto.randomUUID(),
	course: globalThis.crypto.randomUUID(),
	currentUser: '',
}));

vi.mock('../../lib/supabase', () => ({
	getSupabaseClient: () => ({
		auth: {
			getClaims: async () => ({
				data: { claims: { sub: ids.currentUser } },
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

type ApiResult = {
	success: boolean;
	data?: Record<string, unknown>;
	error?: string;
};

async function request(
	actorId: string,
	method: 'PATCH' | 'POST',
	path: string,
	body: Record<string, unknown>,
): Promise<{ status: number; result: ApiResult }> {
	ids.currentUser = actorId;
	const response = await fetch(`${baseUrl}${path}`, {
		method,
		headers: {
			authorization: 'Bearer header.payload.signature',
			'content-type': 'application/json',
		},
		body: JSON.stringify(body),
	});
	return {
		status: response.status,
		result: (await response.json()) as ApiResult,
	};
}

const cases = [
	{
		name: 'notes',
		method: 'PATCH' as const,
		path: (id: string) => `/students/${id}`,
		body: { notes: 'QA-04 note' },
	},
	{
		name: 'PKK',
		method: 'PATCH' as const,
		path: (id: string) => `/students/${id}/pkk`,
		body: { pkkNumber: '12345678901234567890' },
	},
	{
		name: 'school',
		method: 'PATCH' as const,
		path: (id: string) => `/students/${id}/driving-school`,
		body: { schoolId: ids.school },
	},
	{
		name: 'course enrollment',
		method: 'POST' as const,
		path: (id: string) => `/students/${id}/courses`,
		body: { courseId: ids.course },
	},
	{
		name: 'participant status',
		method: 'PATCH' as const,
		path: (id: string) => `/students/${id}/courses/${ids.course}/status`,
		body: { status: CourseParticipantStatus.FINISHED },
	},
];

describe('QA-04 student mutations over HTTP and PostgreSQL', () => {
	beforeAll(async () => {
		const suffix = randomUUID();
		await prisma.user.createMany({
			data: [
				{
					id: ids.admin,
					firstName: 'QA',
					lastName: 'Admin',
					email: `qa04-admin-${suffix}@example.test`,
					role: Role.ADMIN,
				},
				{
					id: ids.manager,
					firstName: 'QA',
					lastName: 'Manager',
					email: `qa04-manager-${suffix}@example.test`,
					role: Role.MANAGER,
				},
				{
					id: ids.otherManager,
					firstName: 'QA',
					lastName: 'Other',
					email: `qa04-other-manager-${suffix}@example.test`,
					role: Role.MANAGER,
				},
				{
					id: ids.instructorUser,
					firstName: 'QA',
					lastName: 'Instructor',
					email: `qa04-instructor-${suffix}@example.test`,
					role: Role.INSTRUCTOR,
				},
				{
					id: ids.studentUser,
					firstName: 'QA',
					lastName: 'Student',
					email: `qa04-student-${suffix}@example.test`,
					role: Role.STUDENT,
				},
				{
					id: ids.otherStudentUser,
					firstName: 'QA',
					lastName: 'OtherStudent',
					email: `qa04-other-student-${suffix}@example.test`,
					role: Role.STUDENT,
				},
				{
					id: ids.inactiveUser,
					firstName: 'QA',
					lastName: 'Inactive',
					email: `qa04-inactive-${suffix}@example.test`,
					role: Role.STUDENT,
					isActive: false,
				},
				{
					id: ids.deletedUser,
					firstName: 'QA',
					lastName: 'Deleted',
					email: `qa04-deleted-${suffix}@example.test`,
					role: Role.STUDENT,
					deletedAt: new Date(),
				},
				{
					id: ids.noProfileUser,
					firstName: 'QA',
					lastName: 'NoProfile',
					email: `qa04-no-profile-${suffix}@example.test`,
					role: Role.STUDENT,
				},
			],
		});
		await prisma.drivingSchool.createMany({
			data: [
				{
					id: ids.school,
					name: `QA-04 school ${suffix}`,
					ownerId: ids.manager,
				},
				{
					id: ids.otherSchool,
					name: `QA-04 other school ${suffix}`,
					ownerId: ids.otherManager,
				},
			],
		});
		await prisma.studentProfile.createMany({
			data: [
				{ id: ids.studentProfile, userId: ids.studentUser },
				{
					id: ids.otherStudentProfile,
					userId: ids.otherStudentUser,
					pkkNumber: '99999999999999999999',
				},
				{ id: ids.inactiveProfile, userId: ids.inactiveUser },
				{ id: ids.deletedProfile, userId: ids.deletedUser },
			],
		});
		await prisma.instructorProfile.create({
			data: {
				id: ids.instructorProfile,
				userId: ids.instructorUser,
				licenseNumber: `QA04-${suffix}`,
			},
		});
		await prisma.instructorSchool.create({
			data: { instructorId: ids.instructorProfile, schoolId: ids.school },
		});
		await prisma.studentSchool.create({
			data: { studentId: ids.studentProfile, schoolId: ids.school },
		});
		await prisma.courseType.create({
			data: {
				id: ids.courseType,
				code: `QA04-${suffix}`,
				name: 'QA-04 type',
			},
		});
		await prisma.course.create({
			data: {
				id: ids.course,
				schoolId: ids.school,
				courseTypeId: ids.courseType,
				name: 'QA-04 course',
				category: 'B',
				kind: CourseKind.THEORY_GROUP,
				totalHours: 30,
			},
		});
		server = createApp().listen(0, '127.0.0.1');
		await new Promise<void>((resolve, reject) => {
			server.once('listening', resolve);
			server.once('error', reject);
		});
		baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	afterAll(async () => {
		if (server)
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve())),
			);
		await prisma.courseParticipant.deleteMany({
			where: { courseId: ids.course },
		});
		await prisma.course.deleteMany({ where: { id: ids.course } });
		await prisma.courseType.deleteMany({ where: { id: ids.courseType } });
		await prisma.studentSchool.deleteMany({
			where: { studentId: ids.studentProfile },
		});
		await prisma.instructorSchool.deleteMany({
			where: { instructorId: ids.instructorProfile },
		});
		await prisma.instructorProfile.deleteMany({
			where: { id: ids.instructorProfile },
		});
		await prisma.studentProfile.deleteMany({
			where: {
				id: {
					in: [
						ids.studentProfile,
						ids.otherStudentProfile,
						ids.inactiveProfile,
						ids.deletedProfile,
					],
				},
			},
		});
		await prisma.drivingSchool.deleteMany({
			where: { id: { in: [ids.school, ids.otherSchool] } },
		});
		await prisma.user.deleteMany({
			where: {
				id: {
					in: [
						ids.admin,
						ids.manager,
						ids.otherManager,
						ids.instructorUser,
						ids.studentUser,
						ids.otherStudentUser,
						ids.inactiveUser,
						ids.deletedUser,
						ids.noProfileUser,
					],
				},
			},
		});
		await prisma.$disconnect();
	});

	for (const operation of cases) {
		it(`${operation.name} preserves student error precedence`, async () => {
			for (const [target, status, error] of [
				[randomUUID(), 404, 'User not found'],
				[ids.deletedUser, 404, 'User not found'],
				[ids.inactiveUser, 403, 'Account is disabled'],
				[ids.manager, 400, 'User is not a student'],
				[ids.noProfileUser, 400, 'User is not a student'],
			] as const) {
				const response = await request(
					ids.manager,
					operation.method,
					operation.path(target),
					operation.body,
				);
				expect(response.status).toBe(status);
				expect(response.result).toMatchObject({
					success: false,
					error,
				});
			}
		});
	}

	it('notes and PKK use userId in HTTP and persist through the student profile', async () => {
		const notes = await request(
			ids.instructorUser,
			'PATCH',
			`/students/${ids.studentUser}`,
			{ notes: 'QA-04 persisted' },
		);
		expect(notes.status).toBe(200);
		expect(notes.result.data).toMatchObject({
			userId: ids.studentUser,
			notes: 'QA-04 persisted',
		});
		const pkk = await request(
			ids.manager,
			'PATCH',
			`/students/${ids.studentUser}/pkk`,
			{ pkkNumber: '12345678901234567890' },
		);
		expect(pkk.status).toBe(200);
		expect(pkk.result.data).toMatchObject({
			userId: ids.studentUser,
			pkkNumber: '12345678901234567890',
		});
		const persisted = await prisma.studentProfile.findUniqueOrThrow({
			where: { id: ids.studentProfile },
		});
		expect(persisted).toMatchObject({
			userId: ids.studentUser,
			notes: 'QA-04 persisted',
			pkkNumber: '12345678901234567890',
		});
		const duplicate = await request(
			ids.admin,
			'PATCH',
			`/students/${ids.studentUser}/pkk`,
			{ pkkNumber: '99999999999999999999' },
		);
		expect(duplicate).toMatchObject({
			status: 409,
			result: { success: false, error: 'PKK number already in use' },
		});
		expect(
			(
				await prisma.studentProfile.findUniqueOrThrow({
					where: { id: ids.studentProfile },
				})
			).pkkNumber,
		).toBe('12345678901234567890');
	});

	it('enrolls by profileId, rejects duplicates, and updates participant status', async () => {
		const enrolled = await request(
			ids.manager,
			'POST',
			`/students/${ids.studentUser}/courses`,
			{ courseId: ids.course },
		);
		expect(enrolled.status).toBe(200);
		expect(
			(enrolled.result.data?.participant as Record<string, unknown>)
				.studentId,
		).toBe(ids.studentProfile);
		const duplicate = await request(
			ids.instructorUser,
			'POST',
			`/students/${ids.studentUser}/courses`,
			{ courseId: ids.course },
		);
		expect(duplicate).toMatchObject({
			status: 409,
			result: {
				success: false,
				error: 'Student is already enrolled in this course',
			},
		});
		const updated = await request(
			ids.instructorUser,
			'PATCH',
			`/students/${ids.studentUser}/courses/${ids.course}/status`,
			{ status: 'FINISHED' },
		);
		expect(updated.status).toBe(200);
		expect(updated.result.data?.participant).toMatchObject({
			studentId: ids.studentProfile,
			status: 'FINISHED',
		});
		expect(
			(
				await prisma.courseParticipant.findFirstOrThrow({
					where: {
						courseId: ids.course,
						studentId: ids.studentProfile,
					},
				})
			).status,
		).toBe(CourseParticipantStatus.FINISHED);
		for (const method of ['POST', 'PATCH'] as const) {
			const path =
				method === 'POST'
					? `/students/${ids.studentUser}/courses`
					: `/students/${ids.studentUser}/courses/${ids.course}/status`;
			const body =
				method === 'POST'
					? { courseId: ids.course }
					: { status: 'ACTIVE' };
			const denied = await request(ids.admin, method, path, body);
			expect(denied.status).toBe(403);
		}
		const adminBeforeStudentLookup = await request(
			ids.admin,
			'POST',
			`/students/${randomUUID()}/courses`,
			{ courseId: ids.course },
		);
		expect(adminBeforeStudentLookup.status).toBe(403);
	});

	it('enforces role and school boundaries before changing data', async () => {
		for (const operation of cases) {
			const student = await request(
				ids.studentUser,
				operation.method,
				operation.path(ids.studentUser),
				operation.body,
			);
			expect(student.status).toBe(403);
			const outsider = await request(
				ids.otherManager,
				operation.method,
				operation.path(ids.studentUser),
				operation.body,
			);
			expect(outsider.status).toBe(403);
		}
		const instructorSchool = await request(
			ids.instructorUser,
			'PATCH',
			`/students/${ids.studentUser}/driving-school`,
			{ schoolId: ids.school },
		);
		expect(instructorSchool.status).toBe(403);
		const invalid = await request(
			ids.manager,
			'PATCH',
			'/students/not-a-uuid/pkk',
			{ pkkNumber: '12345678901234567890' },
		);
		expect(invalid.status).toBe(400);
		const unchangedProfile = await prisma.studentProfile.findUniqueOrThrow({
			where: { id: ids.studentProfile },
		});
		expect(unchangedProfile).toMatchObject({
			notes: 'QA-04 persisted',
			pkkNumber: '12345678901234567890',
		});
		expect(
			(
				await prisma.courseParticipant.findFirstOrThrow({
					where: {
						courseId: ids.course,
						studentId: ids.studentProfile,
					},
				})
			).status,
		).toBe(CourseParticipantStatus.FINISHED);
		expect(
			(
				await prisma.studentSchool.findFirstOrThrow({
					where: { studentId: ids.studentProfile },
				})
			).schoolId,
		).toBe(ids.school);
	});

	it('allows admin to reassign a student school using userId', async () => {
		const moved = await request(
			ids.admin,
			'PATCH',
			`/students/${ids.studentUser}/driving-school`,
			{ schoolId: ids.otherSchool },
		);
		expect(moved.status).toBe(200);
		expect(moved.result.data).toMatchObject({
			userId: ids.studentUser,
			drivingSchool: { id: ids.otherSchool },
		});
		const relation = await prisma.studentSchool.findFirstOrThrow({
			where: { studentId: ids.studentProfile },
		});
		expect(relation.schoolId).toBe(ids.otherSchool);
	});
});
