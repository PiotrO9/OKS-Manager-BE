import { PaymentStatus, Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	listPaymentsForCurrentUser,
	listStudentPayments,
} from '../../services/students.service';

const { prismaMock } = vi.hoisted(() => ({
	prismaMock: {
		courseParticipant: {
			findMany: vi.fn(),
		},
		drivingSchool: {
			findFirst: vi.fn(),
		},
		instructorSchool: {
			findFirst: vi.fn(),
		},
		studentProfile: {
			findFirst: vi.fn(),
		},
	},
}));

vi.mock('../../lib/prisma', () => ({
	getPrisma: () => prismaMock,
}));

const actorId = '11111111-1111-4111-8111-111111111111';
const studentUserId = '22222222-2222-4222-8222-222222222222';
const studentProfileId = '33333333-3333-4333-8333-333333333333';
const schoolId = '44444444-4444-4444-8444-444444444444';

function amount(value: string) {
	return { toString: () => value };
}

function courseParticipantRow() {
	return {
		course: {
			id: '55555555-5555-4555-8555-555555555555',
			name: 'Kurs B',
			paymentPlans: [
				{
					id: '66666666-6666-4666-8666-666666666666',
					currency: 'PLN',
					payments: [
						{
							id: 'paid-latest',
							amount: amount('1200.00'),
							status: PaymentStatus.PAID,
							dueDate: new Date('2026-06-10T00:00:00.000Z'),
							paidAt: new Date('2026-06-20T12:00:00.000Z'),
							createdAt: new Date('2026-06-01T08:00:00.000Z'),
						},
						{
							id: 'pending-middle',
							amount: amount('500.00'),
							status: PaymentStatus.PENDING,
							dueDate: new Date('2026-06-15T00:00:00.000Z'),
							paidAt: null,
							createdAt: new Date('2026-06-01T08:00:00.000Z'),
						},
						{
							id: 'failed-oldest',
							amount: amount('300.00'),
							status: PaymentStatus.FAILED,
							dueDate: null,
							paidAt: null,
							createdAt: new Date('2026-06-05T08:00:00.000Z'),
						},
					],
				},
			],
		},
	};
}

describe('student payments service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		prismaMock.drivingSchool.findFirst.mockResolvedValue({ id: schoolId });
		prismaMock.instructorSchool.findFirst.mockResolvedValue({
			id: 'link-1',
		});
		prismaMock.studentProfile.findFirst.mockResolvedValue({
			id: studentProfileId,
		});
		prismaMock.courseParticipant.findMany.mockResolvedValue([]);
	});

	it('returns student payments sorted newest first with UI statuses', async () => {
		prismaMock.courseParticipant.findMany.mockResolvedValue([
			courseParticipantRow(),
		]);

		const result = await listStudentPayments(
			actorId,
			Role.MANAGER,
			studentUserId,
			{ schoolId },
		);

		expect(result.payments).toEqual([
			{
				id: 'paid-latest',
				courseId: '55555555-5555-4555-8555-555555555555',
				courseName: 'Kurs B',
				paymentPlanId: '66666666-6666-4666-8666-666666666666',
				amount: '1200.00',
				currency: 'PLN',
				status: 'PAID',
				date: '2026-06-20T12:00:00.000Z',
				dueDate: '2026-06-10T00:00:00.000Z',
				paidAt: '2026-06-20T12:00:00.000Z',
			},
			{
				id: 'pending-middle',
				courseId: '55555555-5555-4555-8555-555555555555',
				courseName: 'Kurs B',
				paymentPlanId: '66666666-6666-4666-8666-666666666666',
				amount: '500.00',
				currency: 'PLN',
				status: 'UNPAID',
				date: '2026-06-15T00:00:00.000Z',
				dueDate: '2026-06-15T00:00:00.000Z',
				paidAt: null,
			},
			{
				id: 'failed-oldest',
				courseId: '55555555-5555-4555-8555-555555555555',
				courseName: 'Kurs B',
				paymentPlanId: '66666666-6666-4666-8666-666666666666',
				amount: '300.00',
				currency: 'PLN',
				status: 'UNPAID',
				date: '2026-06-05T08:00:00.000Z',
				dueDate: null,
				paidAt: null,
			},
		]);
	});

	it('returns an empty payment list when student has no course payments', async () => {
		await expect(
			listStudentPayments(actorId, Role.STUDENT, actorId, {}),
		).resolves.toEqual({ payments: [] });
	});

	it('returns empty payments for non-student roles on /me/payments helper', async () => {
		await expect(
			listPaymentsForCurrentUser(actorId, Role.MANAGER),
		).resolves.toEqual({ payments: [] });

		expect(prismaMock.courseParticipant.findMany).not.toHaveBeenCalled();
	});

	it('requires schoolId for staff student payment view', async () => {
		await expect(
			listStudentPayments(actorId, Role.MANAGER, studentUserId, {}),
		).rejects.toMatchObject({
			statusCode: 400,
			message: 'schoolId is required',
		});
	});

	it('rejects manager outside requested school', async () => {
		prismaMock.drivingSchool.findFirst.mockResolvedValue(null);

		await expect(
			listStudentPayments(actorId, Role.MANAGER, studentUserId, {
				schoolId,
			}),
		).rejects.toMatchObject({
			statusCode: 403,
			message: 'Forbidden',
		});

		expect(prismaMock.courseParticipant.findMany).not.toHaveBeenCalled();
	});

	it('filters manager payment query by selected school', async () => {
		await listStudentPayments(actorId, Role.MANAGER, studentUserId, {
			schoolId,
		});

		expect(prismaMock.drivingSchool.findFirst).toHaveBeenCalledWith({
			where: { id: schoolId, ownerId: actorId, deletedAt: null },
			select: { id: true },
		});
		expect(prismaMock.courseParticipant.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					studentId: studentProfileId,
					course: {
						deletedAt: null,
						schoolId,
					},
				},
			}),
		);
	});
});
