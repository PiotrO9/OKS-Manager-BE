import type { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
	AUDIT_FIXTURE_ACCOUNTS,
	getAuditFixtureAccounts,
	restoreAuditAdmin,
	seedAuditFixture,
} from '../../services/auditFixtures.service';

function makeTransaction() {
	const tx = {
		user: {
			create: vi.fn().mockResolvedValue({}),
			update: vi.fn().mockResolvedValue({}),
		},
		courseType: {
			create: vi.fn().mockImplementation(async ({ data }) => ({
				id: `course-type-${data.code}`,
			})),
		},
		drivingSchool: {
			create: vi.fn().mockImplementation(async () => ({
				id:
					tx.drivingSchool.create.mock.calls.length === 1
						? 'school-id'
						: 'foreign-school-id',
			})),
			update: vi.fn().mockResolvedValue({}),
		},
		instructorProfile: {
			create: vi.fn().mockImplementation(async () => ({
				id: `profile-${tx.instructorProfile.create.mock.calls.length}`,
			})),
		},
		studentProfile: {
			create: vi.fn().mockImplementation(async () => ({
				id: `student-profile-${tx.studentProfile.create.mock.calls.length}`,
			})),
		},
		vehicle: {
			create: vi.fn().mockImplementation(async () => ({
				id: `vehicle-${tx.vehicle.create.mock.calls.length}`,
			})),
		},
		course: {
			create: vi.fn().mockImplementation(async () => ({
				id: `course-${tx.course.create.mock.calls.length}`,
			})),
		},
		courseParticipant: {
			create: vi.fn().mockResolvedValue({ id: 'participant-1' }),
		},
		paymentPlan: {
			create: vi.fn().mockResolvedValue({ id: 'payment-plan-1' }),
		},
	};
	return tx;
}

const authIds = new Map(
	AUDIT_FIXTURE_ACCOUNTS.map((account, index) => [
		account.email.toLowerCase(),
		`auth-${index}`,
	]),
);

describe('audit fixtures', () => {
	it('creates an empty manager state with technical access and course types', async () => {
		const tx = makeTransaction();
		const result = await seedAuditFixture(
			tx as unknown as Prisma.TransactionClient,
			'manager-only',
			authIds,
		);

		expect(result.fixture).toEqual({ id: 'manager-only', version: 1 });
		expect(result.created).toMatchObject({
			users: 2,
			drivingSchools: 0,
			courseTypes: 4,
			instructorProfiles: 0,
		});
		expect(tx.drivingSchool.create).not.toHaveBeenCalled();
		expect(tx.instructorProfile.create).not.toHaveBeenCalled();
		expect(result.logicalIds.manager).toBe('auth-1');
	});

	it('creates a school with settings but no operational data', async () => {
		const tx = makeTransaction();
		const result = await seedAuditFixture(
			tx as unknown as Prisma.TransactionClient,
			'school-empty',
			authIds,
		);

		expect(result.created).toMatchObject({
			users: 2,
			drivingSchools: 1,
			schoolSettings: 1,
			instructorProfiles: 0,
		});
		expect(tx.drivingSchool.create).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					ownerId: 'auth-1',
					settings: expect.objectContaining({
						create: expect.any(Object),
					}),
				}),
			}),
		);
		expect(tx.user.update).toHaveBeenCalledWith({
			where: { id: 'auth-1' },
			data: { defaultOskId: 'school-id' },
		});
	});

	it('creates two qualified instructors with school relations and working hours', async () => {
		const tx = makeTransaction();
		const result = await seedAuditFixture(
			tx as unknown as Prisma.TransactionClient,
			'school-staffed',
			authIds,
		);

		expect(result.created).toMatchObject({
			users: 4,
			drivingSchools: 1,
			instructorProfiles: 2,
			instructorSchools: 2,
			instructorWorkingHoursDefaults: 10,
		});
		expect(tx.instructorProfile.create).toHaveBeenCalledTimes(2);
		const first = tx.instructorProfile.create.mock.calls[0]![0].data;
		const second = tx.instructorProfile.create.mock.calls[1]![0].data;
		expect(first.qualifiedCourseTypes.connect).toEqual([
			{ code: 'A' },
			{ code: 'B' },
		]);
		expect(second.qualifiedCourseTypes.connect).toEqual([{ code: 'B' }]);
		expect(first.instructorSchools.create.schoolId).toBe('school-id');
		expect(first.workingHoursDefault.create).toHaveLength(5);
		expect(second.workingHoursDefault.create).toHaveLength(5);
		expect(result.logicalIds['instructor-1-profile']).toBe('profile-1');
	});

	it('checks all Auth identities before any database write', async () => {
		const tx = makeTransaction();
		await expect(
			seedAuditFixture(
				tx as unknown as Prisma.TransactionClient,
				'school-staffed',
				new Map([[AUDIT_FIXTURE_ACCOUNTS[0].email, 'admin-id']]),
			),
		).rejects.toThrow('Missing Auth identity');
		expect(tx.user.create).not.toHaveBeenCalled();
	});

	it('creates a school with two students, vehicles and distinct courses without operational rows', async () => {
		const tx = makeTransaction();
		const result = await seedAuditFixture(
			tx as unknown as Prisma.TransactionClient,
			'school-operational',
			authIds,
		);
		expect(result.created).toMatchObject({
			users: 6,
			studentProfiles: 2,
			studentSchools: 2,
			vehicles: 2,
			courses: 2,
			courseParticipants: 0,
			paymentPlans: 0,
		});
		expect(tx.studentProfile.create).toHaveBeenCalledTimes(2);
		expect(tx.vehicle.create).toHaveBeenCalledTimes(2);
		expect(tx.course.create).toHaveBeenCalledTimes(2);
		expect(tx.courseParticipant.create).not.toHaveBeenCalled();
		expect(tx.paymentPlan.create).not.toHaveBeenCalled();
		expect(tx.drivingSchool.update).toHaveBeenCalledWith({
			where: { id: 'school-id' },
			data: { defaultVehicleId: 'vehicle-1' },
		});
		const [practice, theory] = tx.course.create.mock.calls.map(
			([call]) => call.data,
		);
		expect(practice).toMatchObject({
			schoolId: 'school-id',
			courseTypeId: 'course-type-B',
			kind: 'PRACTICAL',
			instructorId: 'profile-1',
		});
		expect(theory).toMatchObject({
			schoolId: 'school-id',
			kind: 'THEORY_GROUP',
			instructorId: 'profile-2',
			capacity: 12,
		});
		expect(result.logicalIds['student-1-profile']).toBe(
			'student-profile-1',
		);
	});

	it('prepares an enrolled student and a future weekday slot for booking', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-08T20:00:00.000Z'));
		try {
			const tx = makeTransaction();
			const result = await seedAuditFixture(
				tx as unknown as Prisma.TransactionClient,
				'booking-ready',
				authIds,
			);
			expect(result.created.courseParticipants).toBe(1);
			expect(tx.courseParticipant.create).toHaveBeenCalledWith({
				data: {
					courseId: 'course-1',
					studentId: 'student-profile-1',
					status: 'ACTIVE',
				},
			});
			expect(result.bookableWindow).toEqual({
				date: '2026-10-09',
				startTime: '10:00',
				endTime: '11:00',
				timeZone: 'Europe/Warsaw',
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it('moves the suggested booking slot from Friday to Monday', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-10-09T20:00:00.000Z'));
		try {
			const result = await seedAuditFixture(
				makeTransaction() as unknown as Prisma.TransactionClient,
				'booking-ready',
				authIds,
			);
			expect(result.bookableWindow?.date).toBe('2026-10-12');
		} finally {
			vi.useRealTimers();
		}
	});

	it('prepares an installment plan without creating the payment under test', async () => {
		const tx = makeTransaction();
		const result = await seedAuditFixture(
			tx as unknown as Prisma.TransactionClient,
			'payment-ready',
			authIds,
		);
		expect(result.created).toMatchObject({
			courseParticipants: 1,
			paymentPlans: 1,
		});
		expect(tx.paymentPlan.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				courseId: 'course-1',
				totalAmount: expect.anything(),
				type: 'INSTALLMENTS',
				numberOfInstallments: 3,
			}),
		});
		expect(result.logicalIds['payment-plan-practical']).toBe(
			'payment-plan-1',
		);
	});

	it('prepares two isolated schools and accounts with and without active commitments', async () => {
		const tx = makeTransaction();
		const result = await seedAuditFixture(
			tx as unknown as Prisma.TransactionClient,
			'account-ready',
			authIds,
		);

		expect(result.created).toMatchObject({
			users: 10,
			drivingSchools: 2,
			instructorProfiles: 4,
			studentProfiles: 3,
			courseParticipants: 1,
		});
		expect(result.logicalIds['school-foreign']).toBe('foreign-school-id');
		expect(result.logicalIds['manager-foreign']).toBe('auth-6');
		expect(result.logicalIds['instructor-free-profile']).toBe('profile-4');
		expect(tx.drivingSchool.create.mock.calls[1]![0].data.ownerId).toBe(
			'auth-6',
		);
		expect(
			tx.instructorProfile.create.mock.calls[2]![0].data.instructorSchools
				.create.schoolId,
		).toBe('foreign-school-id');
	});

	it('restores only a technical admin after full application reset', async () => {
		const tx = makeTransaction();
		const result = await restoreAuditAdmin(
			tx as unknown as Prisma.TransactionClient,
			authIds,
		);
		expect(result).toEqual({ adminId: 'auth-0' });
		expect(tx.user.create).toHaveBeenCalledTimes(1);
		expect(tx.user.create.mock.calls[0]![0].data.role).toBe('ADMIN');
	});

	it('selects exactly the accounts required by each preset', () => {
		expect(getAuditFixtureAccounts('manager-only')).toHaveLength(2);
		expect(getAuditFixtureAccounts('school-empty')).toHaveLength(2);
		expect(getAuditFixtureAccounts('school-staffed')).toHaveLength(4);
		expect(getAuditFixtureAccounts('school-operational')).toHaveLength(6);
		expect(getAuditFixtureAccounts('booking-ready')).toHaveLength(6);
		expect(getAuditFixtureAccounts('payment-ready')).toHaveLength(6);
		expect(getAuditFixtureAccounts('account-ready')).toHaveLength(10);
	});
});
