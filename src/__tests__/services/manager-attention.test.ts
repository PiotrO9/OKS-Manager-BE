import { LessonStatus, LessonType, PaymentStatus, Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listManagerAttentionItems } from '../../services/manager-attention.service';

const { prismaMock } = vi.hoisted(() => ({
	prismaMock: {
		courseParticipant: {
			findMany: vi.fn(),
		},
		drivingSchool: {
			findFirst: vi.fn(),
		},
		instructorProfile: {
			findMany: vi.fn(),
		},
		lessonRating: {
			findMany: vi.fn(),
		},
		studentProfile: {
			findMany: vi.fn(),
		},
		vehicle: {
			findMany: vi.fn(),
		},
	},
}));

vi.mock('../../lib/prisma', () => ({
	getPrisma: () => prismaMock,
}));

const actorId = '11111111-1111-4111-8111-111111111111';
const schoolId = '22222222-2222-4222-8222-222222222222';
const today = new Date(2026, 6, 11, 10, 0, 0);

function amount(value: string) {
	return { toString: () => value };
}

function user(firstName: string, lastName: string, email?: string) {
	return { firstName, lastName, email: email ?? null };
}

describe('manager attention service', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		prismaMock.drivingSchool.findFirst.mockResolvedValue({ id: schoolId });
		prismaMock.studentProfile.findMany.mockResolvedValue([]);
		prismaMock.courseParticipant.findMany.mockResolvedValue([]);
		prismaMock.vehicle.findMany.mockResolvedValue([]);
		prismaMock.instructorProfile.findMany.mockResolvedValue([]);
		prismaMock.lessonRating.findMany.mockResolvedValue([]);
	});

	it('aggregates student, payment, vehicle, instructor and rating alerts', async () => {
		prismaMock.studentProfile.findMany.mockResolvedValue([
			{
				id: 'student-profile-1',
				userId: 'student-user-1',
				pkkNumber: null,
				user: user('Jan', 'Kowalski', 'jan@example.com'),
				courseParticipants: [],
				lessons: [],
			},
		]);
		prismaMock.courseParticipant.findMany.mockResolvedValue([
			{
				student: {
					userId: 'student-user-2',
					user: user('Marta', 'Zielinska'),
				},
				course: {
					name: 'Kurs B',
					paymentPlans: [
						{
							id: 'plan-1',
							currency: 'PLN',
							payments: [
								{
									id: 'payment-overdue',
									amount: amount('500.00'),
									dueDate: new Date(
										'2026-07-01T00:00:00.000Z',
									),
									status: PaymentStatus.PENDING,
								},
								{
									id: 'payment-soon',
									amount: amount('300.00'),
									dueDate: new Date(
										'2026-07-15T00:00:00.000Z',
									),
									status: PaymentStatus.FAILED,
								},
							],
						},
					],
				},
			},
		]);
		prismaMock.vehicle.findMany.mockResolvedValue([
			{
				id: 'vehicle-1',
				name: 'Toyota Yaris',
				registrationNumber: 'WX12345',
				insuranceDate: new Date('2026-07-01T00:00:00.000Z'),
				inspectionDate: new Date('2026-08-01T00:00:00.000Z'),
			},
		]);
		prismaMock.instructorProfile.findMany.mockResolvedValue([
			{
				id: 'instructor-1',
				userId: 'instructor-user-1',
				user: user('Anna', 'Nowak'),
				workingHours: [],
			},
		]);
		prismaMock.lessonRating.findMany.mockResolvedValue([
			{
				id: 'rating-1',
				rating: 2,
				createdAt: new Date('2026-07-10T12:00:00.000Z'),
				student: {
					userId: 'student-user-3',
					user: user('Piotr', 'Wisniewski'),
				},
				instructor: {
					user: user('Ewa', 'Krawczyk'),
				},
			},
		]);

		const result = await listManagerAttentionItems(
			actorId,
			Role.MANAGER,
			schoolId,
			{ today },
		);

		expect(result.total).toBe(9);
		expect(result.hiddenCount).toBe(0);
		expect(result.items.map((item) => item.type)).toEqual([
			'payment_overdue',
			'vehicle_document_expired',
			'low_lesson_rating',
			'payment_due_soon',
			'student_missing_pkk',
			'student_missing_course',
			'student_missing_first_lesson',
			'instructor_missing_availability',
			'vehicle_document_expiring',
		]);
		expect(result.items[0]).toMatchObject({
			type: 'payment_overdue',
			priority: 'urgent',
			entityId: 'student-user-2',
			dueDate: '2026-07-01',
			actionTo: '/manager/students/student-user-2',
		});
		expect(result.items[1]).toMatchObject({
			type: 'vehicle_document_expired',
			priority: 'urgent',
			dueDate: '2026-07-01',
			actionTo: '/vehicles/vehicle-1',
		});
	});

	it('limits dashboard items to 10 and reports hidden count', async () => {
		prismaMock.studentProfile.findMany.mockResolvedValue(
			Array.from({ length: 12 }, (_, index) => ({
				id: `student-profile-${index}`,
				userId: `student-user-${index}`,
				pkkNumber: null,
				user: user(`Jan${index}`, 'Kowalski'),
				courseParticipants: [{ id: `course-${index}` }],
				lessons: [{ id: `lesson-${index}` }],
			})),
		);

		const result = await listManagerAttentionItems(
			actorId,
			Role.MANAGER,
			schoolId,
			{ today },
		);

		expect(result.total).toBe(12);
		expect(result.items).toHaveLength(10);
		expect(result.hiddenCount).toBe(2);
	});

	it('rejects non-manager roles and managers outside the school', async () => {
		await expect(
			listManagerAttentionItems(actorId, Role.ADMIN, schoolId, {
				today,
			}),
		).rejects.toMatchObject({
			statusCode: 403,
			message: 'Forbidden',
		});

		prismaMock.drivingSchool.findFirst.mockResolvedValue(null);

		await expect(
			listManagerAttentionItems(actorId, Role.MANAGER, schoolId, {
				today,
			}),
		).rejects.toMatchObject({
			statusCode: 403,
			message: 'Forbidden',
		});
	});

	it('queries with the expected attention windows', async () => {
		await listManagerAttentionItems(actorId, Role.MANAGER, schoolId, {
			today,
		});

		expect(prismaMock.courseParticipant.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				select: expect.objectContaining({
					course: expect.objectContaining({
						select: expect.objectContaining({
							paymentPlans: expect.objectContaining({
								select: expect.objectContaining({
									payments: expect.objectContaining({
										where: {
											status: {
												not: PaymentStatus.PAID,
											},
											dueDate: { not: null },
										},
									}),
								}),
							}),
						}),
					}),
				}),
			}),
		);
		expect(prismaMock.vehicle.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					OR: [
						{
							insuranceDate: {
								lte: new Date(2026, 7, 10),
							},
						},
						{
							inspectionDate: {
								lte: new Date(2026, 7, 10),
							},
						},
					],
				}),
			}),
		);
		expect(prismaMock.instructorProfile.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				select: expect.objectContaining({
					workingHours: expect.objectContaining({
						where: {
							date: {
								gte: new Date(2026, 6, 6),
								lt: new Date(2026, 6, 13),
							},
						},
						select: { id: true },
						take: 1,
					}),
				}),
			}),
		);
		expect(prismaMock.lessonRating.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({
					rating: { lte: 2 },
					createdAt: {
						gte: new Date(2026, 5, 27),
					},
					lesson: expect.objectContaining({
						lessonType: LessonType.PRACTICE,
						status: LessonStatus.COMPLETED,
					}),
				}),
			}),
		);
	});
});
