import { Prisma, Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import type { StudentPaymentsQuery } from '../../lib/validation/uuid';
import { assertActorCanListStudentsForSchool } from './access';
import type {
	CreateStudentPaymentInput,
	MarkStudentPaymentPaidInput,
	MarkStudentPaymentUnpaidInput,
	StudentPaymentItemDto,
	StudentPaymentsDto,
	UpdateStudentPaymentInput,
} from './types';
import { mapPaymentStatus, paymentSortTime, toIsoOrNull } from './utils';

const prisma = getPrisma();
const emptySummary = {
	paidAmount: '0.00',
	unpaidAmount: '0.00',
	overdueAmount: '0.00',
	overdueCount: 0,
	nextDueDate: null,
	currency: 'PLN',
};

function parseDateOnly(value: string | null | undefined): Date | null {
	if (!value) {
		return null;
	}

	return new Date(`${value}T00:00:00.000Z`);
}

function todayUtcStart(): Date {
	const now = new Date();
	return new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
	);
}

function formatAmount(value: number): string {
	return value.toFixed(2);
}

function buildPaymentsDto(payments: StudentPaymentItemDto[]): StudentPaymentsDto {
	const today = todayUtcStart();
	let paidAmount = 0;
	let unpaidAmount = 0;
	let overdueAmount = 0;
	let overdueCount = 0;
	let nextDueDate: string | null = null;
	let nextDueTime = Number.POSITIVE_INFINITY;
	const currency = payments[0]?.currency ?? 'PLN';

	for (const payment of payments) {
		const amount = Number(payment.amount);

		if (!Number.isFinite(amount)) {
			continue;
		}

		if (payment.status === 'PAID') {
			paidAmount += amount;
			continue;
		}

		unpaidAmount += amount;

		if (!payment.dueDate) {
			continue;
		}

		const dueDate = new Date(payment.dueDate);

		if (Number.isNaN(dueDate.getTime())) {
			continue;
		}

		if (dueDate < today) {
			overdueAmount += amount;
			overdueCount += 1;
		} else if (dueDate.getTime() < nextDueTime) {
			nextDueTime = dueDate.getTime();
			nextDueDate = payment.dueDate;
		}
	}

	return {
		payments,
		summary: {
			paidAmount: formatAmount(paidAmount),
			unpaidAmount: formatAmount(unpaidAmount),
			overdueAmount: formatAmount(overdueAmount),
			overdueCount,
			nextDueDate,
			currency,
		},
	};
}

export async function listPaymentsForCurrentUser(
	actorId: string,
	actorRole: Role,
): Promise<StudentPaymentsDto> {
	if (actorRole !== Role.STUDENT) {
		return { payments: [], summary: emptySummary };
	}

	return listStudentPayments(actorId, actorRole, actorId, {});
}

export async function listStudentPayments(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	query: StudentPaymentsQuery,
): Promise<StudentPaymentsDto> {
	if (actorRole === Role.STUDENT && actorId !== studentUserId) {
		throw AppError.forbidden('Forbidden');
	}

	if (actorRole !== Role.STUDENT && !query.schoolId) {
		throw AppError.badRequest('schoolId is required');
	}

	if (actorRole !== Role.STUDENT) {
		await assertActorCanListStudentsForSchool(
			actorId,
			actorRole,
			query.schoolId!,
		);
	}

	const studentWhere: Prisma.StudentProfileWhereInput = {
		userId: studentUserId,
		user: { deletedAt: null },
	};

	if (query.schoolId) {
		studentWhere.studentSchools = {
			some: {
				schoolId: query.schoolId,
				school: { deletedAt: null },
			},
		};
	}

	const student = await prisma.studentProfile.findFirst({
		where: studentWhere,
		select: { id: true },
	});

	if (!student) {
		throw AppError.notFound('Student not found');
	}

	const rows = await prisma.courseParticipant.findMany({
		where: {
			studentId: student.id,
			course: {
				deletedAt: null,
				...(query.schoolId ? { schoolId: query.schoolId } : {}),
			},
		},
		select: {
			course: {
				select: {
					id: true,
					name: true,
					paymentPlans: {
						select: {
							id: true,
							currency: true,
							payments: {
								select: {
									id: true,
									amount: true,
									dueDate: true,
									paidAt: true,
									status: true,
									method: true,
									createdAt: true,
								},
							},
						},
					},
				},
			},
		},
	});

	const payments = rows.flatMap((row) =>
		row.course.paymentPlans.flatMap((plan) =>
			plan.payments.map((payment) => {
				const date =
					payment.paidAt ?? payment.dueDate ?? payment.createdAt;

				return {
					id: payment.id,
					courseId: row.course.id,
					courseName: row.course.name,
					paymentPlanId: plan.id,
					amount: payment.amount.toString(),
					currency: plan.currency,
					status: mapPaymentStatus(payment.status),
					date: toIsoOrNull(date),
					dueDate: toIsoOrNull(payment.dueDate),
					paidAt: toIsoOrNull(payment.paidAt),
					method: payment.method,
					_sortTime: paymentSortTime(payment),
				};
			}),
		),
	);

	payments.sort((a, b) => b._sortTime - a._sortTime);

	return buildPaymentsDto(payments.map(({ _sortTime, ...payment }) => payment));
}

async function assertManagerCanManageStudentPayments(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	schoolId: string,
) {
	if (actorRole !== Role.MANAGER) {
		throw AppError.forbidden('Forbidden');
	}

	await assertActorCanListStudentsForSchool(actorId, actorRole, schoolId);

	const student = await prisma.studentProfile.findFirst({
		where: {
			userId: studentUserId,
			user: { deletedAt: null },
			studentSchools: {
				some: {
					schoolId,
					school: { deletedAt: null },
				},
			},
		},
		select: { id: true },
	});

	if (!student) {
		throw AppError.notFound('Student not found');
	}

	return student;
}

async function assertPaymentPlanBelongsToStudentCourse(
	studentId: string,
	schoolId: string,
	paymentPlanId: string,
) {
	const plan = await prisma.paymentPlan.findFirst({
		where: {
			id: paymentPlanId,
			course: {
				schoolId,
				deletedAt: null,
				participants: {
					some: { studentId },
				},
			},
		},
		select: { id: true },
	});

	if (!plan) {
		throw AppError.notFound('Payment plan not found');
	}

	return plan;
}

async function assertPaymentBelongsToStudentCourse(
	studentId: string,
	schoolId: string,
	paymentId: string,
) {
	const payment = await prisma.payment.findFirst({
		where: {
			id: paymentId,
			paymentPlan: {
				course: {
					schoolId,
					deletedAt: null,
					participants: {
						some: { studentId },
					},
				},
			},
		},
		select: { id: true },
	});

	if (!payment) {
		throw AppError.notFound('Payment not found');
	}

	return payment;
}

export async function createStudentPaymentForManager(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	input: CreateStudentPaymentInput,
): Promise<StudentPaymentsDto> {
	const student = await assertManagerCanManageStudentPayments(
		actorId,
		actorRole,
		studentUserId,
		input.schoolId,
	);

	await assertPaymentPlanBelongsToStudentCourse(
		student.id,
		input.schoolId,
		input.paymentPlanId,
	);

	await prisma.payment.create({
		data: {
			paymentPlanId: input.paymentPlanId,
			amount: new Prisma.Decimal(input.amount),
			dueDate: parseDateOnly(input.dueDate),
			method: input.method ?? null,
			status: 'PENDING',
		},
	});

	return listStudentPayments(actorId, actorRole, studentUserId, {
		schoolId: input.schoolId,
	});
}

export async function updateStudentPaymentForManager(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	paymentId: string,
	input: UpdateStudentPaymentInput,
): Promise<StudentPaymentsDto> {
	const student = await assertManagerCanManageStudentPayments(
		actorId,
		actorRole,
		studentUserId,
		input.schoolId,
	);

	await assertPaymentBelongsToStudentCourse(student.id, input.schoolId, paymentId);

	await prisma.payment.update({
		where: { id: paymentId },
		data: {
			...(input.dueDate !== undefined
				? { dueDate: parseDateOnly(input.dueDate) }
				: {}),
			...(input.method !== undefined ? { method: input.method ?? null } : {}),
		},
	});

	return listStudentPayments(actorId, actorRole, studentUserId, {
		schoolId: input.schoolId,
	});
}

export async function markStudentPaymentPaidForManager(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	paymentId: string,
	input: MarkStudentPaymentPaidInput,
): Promise<StudentPaymentsDto> {
	const student = await assertManagerCanManageStudentPayments(
		actorId,
		actorRole,
		studentUserId,
		input.schoolId,
	);

	await assertPaymentBelongsToStudentCourse(student.id, input.schoolId, paymentId);

	await prisma.payment.update({
		where: { id: paymentId },
		data: {
			status: 'PAID',
			paidAt: parseDateOnly(input.paidAt) ?? new Date(),
		},
	});

	return listStudentPayments(actorId, actorRole, studentUserId, {
		schoolId: input.schoolId,
	});
}

export async function markStudentPaymentUnpaidForManager(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	paymentId: string,
	input: MarkStudentPaymentUnpaidInput,
): Promise<StudentPaymentsDto> {
	const student = await assertManagerCanManageStudentPayments(
		actorId,
		actorRole,
		studentUserId,
		input.schoolId,
	);

	await assertPaymentBelongsToStudentCourse(student.id, input.schoolId, paymentId);

	await prisma.payment.update({
		where: { id: paymentId },
		data: {
			status: 'PENDING',
			paidAt: null,
		},
	});

	return listStudentPayments(actorId, actorRole, studentUserId, {
		schoolId: input.schoolId,
	});
}
