import { Prisma, Role } from '@prisma/client';
import { getPrisma } from '../../lib/prisma';
import {
	assertManagerCanManageStudentPayments,
	assertPaymentBelongsToStudentCourse,
	assertPaymentPlanBelongsToStudentCourse,
} from './paymentsAccess';
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

	await assertPaymentBelongsToStudentCourse(
		student.id,
		input.schoolId,
		paymentId,
	);

	await prisma.payment.update({
		where: { id: paymentId },
		data: {
			...(input.dueDate !== undefined
				? { dueDate: parseDateOnly(input.dueDate) }
				: {}),
			...(input.method !== undefined
				? { method: input.method ?? null }
				: {}),
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

	await assertPaymentBelongsToStudentCourse(
		student.id,
		input.schoolId,
		paymentId,
	);

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

	await assertPaymentBelongsToStudentCourse(
		student.id,
		input.schoolId,
		paymentId,
	);

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
