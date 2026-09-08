import { Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import { assertActorCanListStudentsForSchool } from './access';

const prisma = getPrisma();

export async function assertManagerCanManageStudentPayments(
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

export async function assertPaymentPlanBelongsToStudentCourse(
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

export async function assertPaymentBelongsToStudentCourse(
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
