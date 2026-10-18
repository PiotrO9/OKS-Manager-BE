import { Role, type Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { findManagerAccountObligations } from '../../services/managerAccountObligations.service';

const schoolId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';

function makeTx() {
	const findMany = vi.fn().mockResolvedValue([]);
	return {
		studentProfile: {
			findUnique: vi.fn().mockResolvedValue({ id: 'student-profile' }),
		},
		instructorProfile: {
			findUnique: vi.fn().mockResolvedValue({ id: 'instructor-profile' }),
		},
		lesson: { findMany: vi.fn().mockResolvedValue([]) },
		courseParticipant: { findMany: vi.fn().mockResolvedValue([]) },
		eventParticipant: { findMany: vi.fn().mockResolvedValue([]) },
		payment: { findMany: vi.fn().mockResolvedValue([]) },
		course: { findMany: vi.fn().mockResolvedValue([]) },
		instructorEvent: { findMany: vi.fn().mockResolvedValue([]) },
		instructorTimeBlock: { findMany },
	};
}

describe('manager account archive obligations', () => {
	it('returns individual student obligations using the archive predicates', async () => {
		const tx = makeTx();
		tx.lesson.findMany.mockResolvedValue([
			{
				id: 'lesson-1',
				startTime: new Date('2030-01-01'),
				endTime: new Date('2030-01-01T01:00:00Z'),
				course: { name: 'Kurs A' },
			},
		]);
		tx.courseParticipant.findMany.mockResolvedValue([
			{ course: { id: 'course-1', name: 'Kurs A' } },
		]);
		tx.eventParticipant.findMany.mockResolvedValue([
			{
				event: {
					id: 'event-1',
					type: 'THEORY',
					startTime: new Date('2030-01-02'),
					endTime: new Date('2030-01-02T01:00:00Z'),
				},
			},
		]);
		tx.payment.findMany.mockResolvedValue([
			{
				id: 'payment-1',
				amount: { toString: () => '100.00' },
				dueDate: null,
				paymentPlan: { currency: 'PLN', course: { name: 'Kurs A' } },
			},
		]);
		const result = await findManagerAccountObligations(
			tx as unknown as Prisma.TransactionClient,
			userId,
			Role.STUDENT,
			schoolId,
		);
		expect(result.map(({ type, id }) => [type, id])).toEqual([
			['LESSON', 'lesson-1'],
			['COURSE', 'course-1'],
			['EVENT', 'event-1'],
			['PAYMENT', 'payment-1'],
		]);
		expect(tx.payment.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					status: 'PENDING',
					paymentPlan: {
						course: {
							schoolId,
							participants: {
								some: { studentId: 'student-profile' },
							},
						},
					},
				},
			}),
		);
	});

	it('returns instructor time blocks scoped to the current school', async () => {
		const tx = makeTx();
		tx.instructorTimeBlock.findMany.mockResolvedValue([
			{
				id: 'block-1',
				type: 'BREAK',
				startTime: new Date('2030-01-03'),
				endTime: new Date('2030-01-03T01:00:00Z'),
			},
		]);
		const result = await findManagerAccountObligations(
			tx as unknown as Prisma.TransactionClient,
			userId,
			Role.INSTRUCTOR,
			schoolId,
		);
		expect(result.map(({ type, id }) => [type, id])).toEqual([
			['TIME_BLOCK', 'block-1'],
		]);
		expect(tx.instructorTimeBlock.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					instructorId: 'instructor-profile',
					schoolId,
					startTime: { gte: expect.any(Date) },
				}),
			}),
		);
	});
});
