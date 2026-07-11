import { PaymentStatus, Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createStudentPaymentForManager,
	listPaymentsForCurrentUser,
	listStudentPayments,
	markStudentPaymentPaidForManager,
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
		paymentPlan: {
			findFirst: vi.fn(),
		},
		payment: {
			create: vi.fn(),
			findFirst: vi.fn(),
			update: vi.fn(),
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
const paymentPlanId = '66666666-6666-4666-8666-666666666666';
const paymentId = '77777777-7777-4777-8777-777777777777';

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
					id: paymentPlanId,
					currency: 'PLN',
					payments: [
						{
							id: 'paid-latest',
							amount: amount('1200.00'),
							status: PaymentStatus.PAID,
							dueDate: new Date('2026-06-10T00:00:00.000Z'),
							paidAt: new Date('2026-06-20T12:00:00.000Z'),
							method: 'transfer',
							createdAt: new Date('2026-06-01T08:00:00.000Z'),
						},
						{
							id: 'pending-middle',
							amount: amount('500.00'),
							status: PaymentStatus.PENDING,
							dueDate: new Date('2026-06-15T00:00:00.000Z'),
							paidAt: null,
							method: null,
							createdAt: new Date('2026-06-01T08:00:00.000Z'),
						},
						{
							id: 'failed-oldest',
							amount: amount('300.00'),
							status: PaymentStatus.FAILED,
							dueDate: null,
							paidAt: null,
							method: null,
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
		prismaMock.paymentPlan.findFirst.mockResolvedValue({ id: paymentPlanId });
		prismaMock.payment.findFirst.mockResolvedValue({ id: paymentId });
		prismaMock.payment.create.mockResolvedValue({ id: paymentId });
		prismaMock.payment.update.mockResolvedValue({ id: paymentId });
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
				method: 'transfer',
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
				method: null,
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
				method: null,
			},
		]);
		expect(result.summary).toMatchObject({
			paidAmount: '1200.00',
			unpaidAmount: '800.00',
			currency: 'PLN',
		});
	});

	it('returns an empty payment list when student has no course payments', async () => {
		await expect(
			listStudentPayments(actorId, Role.STUDENT, actorId, {}),
		).resolves.toEqual({
			payments: [],
			summary: {
				paidAmount: '0.00',
				unpaidAmount: '0.00',
				overdueAmount: '0.00',
				overdueCount: 0,
				nextDueDate: null,
				currency: 'PLN',
			},
		});
	});

	it('returns empty payments for non-student roles on /me/payments helper', async () => {
		await expect(
			listPaymentsForCurrentUser(actorId, Role.MANAGER),
		).resolves.toEqual({
			payments: [],
			summary: {
				paidAmount: '0.00',
				unpaidAmount: '0.00',
				overdueAmount: '0.00',
				overdueCount: 0,
				nextDueDate: null,
				currency: 'PLN',
			},
		});

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

	it('allows manager to add a payment to an existing student payment plan', async () => {
		await createStudentPaymentForManager(actorId, Role.MANAGER, studentUserId, {
			schoolId,
			paymentPlanId,
			amount: '700.00',
			dueDate: '2026-08-01',
			method: 'cash',
		});

		expect(prismaMock.paymentPlan.findFirst).toHaveBeenCalledWith({
			where: {
				id: paymentPlanId,
				course: {
					schoolId,
					deletedAt: null,
					participants: {
						some: { studentId: studentProfileId },
					},
				},
			},
			select: { id: true },
		});
		expect(prismaMock.payment.create).toHaveBeenCalledWith({
			data: {
				paymentPlanId,
				amount: expect.any(Object),
				dueDate: new Date('2026-08-01T00:00:00.000Z'),
				method: 'cash',
				status: 'PENDING',
			},
		});
	});

	it('marks an existing scoped student payment as paid', async () => {
		await markStudentPaymentPaidForManager(
			actorId,
			Role.MANAGER,
			studentUserId,
			paymentId,
			{ schoolId, paidAt: '2026-08-02' },
		);

		expect(prismaMock.payment.findFirst).toHaveBeenCalledWith({
			where: {
				id: paymentId,
				paymentPlan: {
					course: {
						schoolId,
						deletedAt: null,
						participants: {
							some: { studentId: studentProfileId },
						},
					},
				},
			},
			select: { id: true },
		});
		expect(prismaMock.payment.update).toHaveBeenCalledWith({
			where: { id: paymentId },
			data: {
				status: 'PAID',
				paidAt: new Date('2026-08-02T00:00:00.000Z'),
			},
		});
	});
});
