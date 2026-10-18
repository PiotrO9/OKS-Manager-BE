import { Prisma, Role } from '@prisma/client';
import { getPrisma } from '../../lib/prisma';
import { AppError } from '../../lib/http/AppError';
import { resolveStudentPaymentSchool } from './paymentsAccess';
import { parseDateOnly } from './paymentsMappers';
import { listStudentPayments } from './paymentsQueries';
import type {
	CreateStudentPaymentInput,
	MarkStudentPaymentPaidInput,
	MarkStudentPaymentUnpaidInput,
	StudentPaymentsDto,
	UpdateStudentPaymentInput,
} from './types';

const prisma = getPrisma();

async function mutateStudentPayment(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	resource: { paymentPlanId: string } | { paymentId: string },
	requestedSchoolId: string | undefined,
	mutate: (tx: Prisma.TransactionClient) => Promise<unknown>,
): Promise<StudentPaymentsDto> {
	if (actorRole !== Role.MANAGER) throw AppError.forbidden('Forbidden');
	return prisma.$transaction(async (tx) => {
		// Match the user lock taken by transfers and account mutations.
		await tx.$queryRaw`SELECT id FROM users WHERE id = ${studentUserId}::uuid FOR UPDATE`;
		const schoolId = await resolveStudentPaymentSchool(
			tx,
			actorId,
			actorRole,
			studentUserId,
			resource,
			requestedSchoolId,
		);
		await mutate(tx);
		return listStudentPayments(
			actorId,
			actorRole,
			studentUserId,
			{ schoolId },
			tx,
		);
	});
}

export async function createStudentPaymentForManager(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	input: CreateStudentPaymentInput,
): Promise<StudentPaymentsDto> {
	return mutateStudentPayment(
		actorId,
		actorRole,
		studentUserId,
		{ paymentPlanId: input.paymentPlanId },
		input.schoolId,
		(tx) =>
			tx.payment.create({
				data: {
					paymentPlanId: input.paymentPlanId,
					amount: new Prisma.Decimal(input.amount),
					dueDate: parseDateOnly(input.dueDate),
					method: input.method ?? null,
					status: 'PENDING',
				},
			}),
	);
}

export async function updateStudentPaymentForManager(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	paymentId: string,
	input: UpdateStudentPaymentInput,
): Promise<StudentPaymentsDto> {
	return mutateStudentPayment(
		actorId,
		actorRole,
		studentUserId,
		{ paymentId },
		input.schoolId,
		(tx) =>
			tx.payment.update({
				where: { id: paymentId },
				data: {
					...(input.dueDate !== undefined
						? { dueDate: parseDateOnly(input.dueDate) }
						: {}),
					...(input.method !== undefined
						? { method: input.method ?? null }
						: {}),
				},
			}),
	);
}

export async function markStudentPaymentPaidForManager(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	paymentId: string,
	input: MarkStudentPaymentPaidInput,
): Promise<StudentPaymentsDto> {
	return mutateStudentPayment(
		actorId,
		actorRole,
		studentUserId,
		{ paymentId },
		input.schoolId,
		(tx) =>
			tx.payment.update({
				where: { id: paymentId },
				data: {
					status: 'PAID',
					paidAt: parseDateOnly(input.paidAt) ?? new Date(),
				},
			}),
	);
}

export async function markStudentPaymentUnpaidForManager(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	paymentId: string,
	input: MarkStudentPaymentUnpaidInput,
): Promise<StudentPaymentsDto> {
	return mutateStudentPayment(
		actorId,
		actorRole,
		studentUserId,
		{ paymentId },
		input.schoolId,
		(tx) =>
			tx.payment.update({
				where: { id: paymentId },
				data: { status: 'PENDING', paidAt: null },
			}),
	);
}
