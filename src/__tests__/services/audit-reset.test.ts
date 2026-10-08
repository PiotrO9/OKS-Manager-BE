import { Role, type PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
	AuditResetConflictError,
	AuditResetUnavailableError,
	previewAuditReset,
	resetAuditDatabase,
} from '../../services/auditReset.service';

function createDatabase(options: { locked?: boolean; admins?: number } = {}) {
	const calls: Array<{ method: string; args: unknown[] }> = [];
	const record = (method: string) =>
		vi.fn(async (...args: unknown[]) => {
			calls.push({ method, args });
			return { count: 1 };
		});
	const countUser = vi.fn(async (args?: { where?: { role?: Role } }) => {
		if (args?.where?.role === Role.ADMIN) return options.admins ?? 1;
		if (args?.where?.role === Role.MANAGER) return 1;
		if (args?.where?.role === Role.INSTRUCTOR) return 2;
		if (args?.where?.role === Role.STUDENT) return 3;
		return 7;
	});
	const resource = (name: string, count: number) => ({
		count: vi.fn(async () => count),
		deleteMany: record(`${name}.deleteMany`),
	});
	const tx = {
		$queryRaw: vi.fn(async () => [{ locked: options.locked ?? true }]),
		$executeRawUnsafe: record('$executeRawUnsafe'),
		user: {
			count: countUser,
			findMany: vi.fn(async () => [
				{ id: 'admin-id' },
				{ id: 'manager-id' },
			]),
			updateMany: record('user.updateMany'),
			deleteMany: record('user.deleteMany'),
		},
		drivingSchool: {
			...resource('drivingSchool', 1),
			findMany: vi.fn(async () => [{ id: 'school-id' }]),
		},
		instructorSchool: {
			...resource('instructorSchool', 1),
			findMany: vi.fn(async () => [
				{ instructor: { userId: 'instructor-id' } },
			]),
		},
		course: resource('course', 4),
		lesson: resource('lesson', 5),
		instructorEvent: resource('instructorEvent', 6),
		vehicle: resource('vehicle', 7),
		accountAction: resource('accountAction', 0),
		accountSession: resource('accountSession', 0),
		eventParticipant: resource('eventParticipant', 0),
		lessonRating: resource('lessonRating', 0),
		payment: resource('payment', 0),
		paymentPlan: resource('paymentPlan', 0),
		instructorTimeBlock: resource('instructorTimeBlock', 0),
		instructorLeave: resource('instructorLeave', 0),
		instructorWorkingHours: resource('instructorWorkingHours', 0),
		courseParticipant: resource('courseParticipant', 0),
		studentSchool: resource('studentSchool', 0),
		studentProfile: resource('studentProfile', 0),
		instructorProfile: resource('instructorProfile', 0),
		courseType: resource('courseType', 0),
	};
	const prisma = {
		...tx,
		$transaction: vi.fn(
			async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
		),
	} as unknown as PrismaClient;
	return { prisma, tx, calls };
}

describe('audit reset', () => {
	it('previews the accounts and schools kept at each level', async () => {
		const { prisma } = createDatabase();
		const managers = await previewAuditReset(prisma, 'managers');
		const schools = await previewAuditReset(prisma, 'schools');
		const instructors = await previewAuditReset(prisma, 'instructors');

		expect(managers.retained).toMatchObject({
			users: 2,
			schools: 0,
			instructors: 0,
		});
		expect(schools.retained).toMatchObject({
			users: 2,
			schools: 1,
			instructors: 0,
		});
		expect(instructors.retained).toMatchObject({
			users: 3,
			schools: 1,
			instructors: 1,
		});
		expect(instructors.reason).toBeNull();
	});

	it('counts each retained instructor once even if memberships repeat', async () => {
		const { prisma, tx } = createDatabase();
		tx.instructorSchool.findMany.mockResolvedValue([
			{ instructor: { userId: 'instructor-id' } },
			{ instructor: { userId: 'instructor-id' } },
		]);
		const preview = await previewAuditReset(prisma, 'instructors');
		expect(preview.retained).toMatchObject({ users: 3, instructors: 1 });
	});

	it('removes dependent data before profiles and keeps only staff from preserved schools', async () => {
		const { prisma, tx, calls } = createDatabase();
		await resetAuditDatabase(prisma, 'instructors');

		const order = calls.map(({ method }) => method);
		expect(order.indexOf('lessonRating.deleteMany')).toBeLessThan(
			order.indexOf('lesson.deleteMany'),
		);
		expect(order.indexOf('lesson.deleteMany')).toBeLessThan(
			order.indexOf('instructorProfile.deleteMany'),
		);
		expect(order.indexOf('accountAction.deleteMany')).toBeLessThan(
			order.indexOf('user.deleteMany'),
		);
		expect(tx.instructorProfile.deleteMany).toHaveBeenCalledWith({
			where: { userId: { notIn: ['instructor-id'] } },
		});
		expect(tx.user.deleteMany).toHaveBeenCalledWith({
			where: {
				id: { notIn: ['admin-id', 'manager-id', 'instructor-id'] },
			},
		});
		expect(tx.drivingSchool.deleteMany).toHaveBeenCalledWith({
			where: { id: { notIn: ['school-id'] } },
		});
	});

	it('rejects a concurrent reset or stale preview before any deletion', async () => {
		const locked = createDatabase({ locked: false });
		await expect(
			resetAuditDatabase(locked.prisma, 'managers'),
		).rejects.toBeInstanceOf(AuditResetConflictError);
		expect(locked.calls).toEqual([]);

		const stale = createDatabase();
		const preview = await previewAuditReset(stale.prisma, 'managers');
		preview.retained.users = 99;
		await expect(
			resetAuditDatabase(stale.prisma, 'managers', {
				expectedPreview: preview,
			}),
		).rejects.toBeInstanceOf(AuditResetConflictError);
		expect(stale.calls).toEqual([]);
	});

	it('requires an active admin for partial reset and recovery callback for full reset', async () => {
		const noAdmin = createDatabase({ admins: 0 });
		await expect(
			resetAuditDatabase(noAdmin.prisma, 'schools'),
		).rejects.toBeInstanceOf(AuditResetUnavailableError);
		expect(noAdmin.calls).toEqual([]);

		const full = createDatabase();
		await expect(
			resetAuditDatabase(full.prisma, 'full'),
		).rejects.toBeInstanceOf(AuditResetUnavailableError);
		expect(full.calls).toEqual([]);
	});

	it('clears account relations and restores admin inside a full reset transaction', async () => {
		const { prisma, calls } = createDatabase();
		const restoreAfterFull = vi.fn(async () => {
			calls.push({ method: 'restoreAfterFull', args: [] });
		});
		await resetAuditDatabase(prisma, 'full', { restoreAfterFull });
		expect(calls.map(({ method }) => method)).toEqual([
			'accountAction.deleteMany',
			'accountSession.deleteMany',
			'$executeRawUnsafe',
			'restoreAfterFull',
		]);
		expect(restoreAfterFull).toHaveBeenCalledOnce();
	});
});
