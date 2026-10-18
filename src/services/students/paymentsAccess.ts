import { Role, type Prisma } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { assertActorCanListStudentsForSchool } from './access';

/** Resolve ownership from the payment's course, including after a student transfer. */
export async function resolveStudentPaymentSchool(
	db: Prisma.TransactionClient,
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	resource: { paymentPlanId: string } | { paymentId: string },
	requestedSchoolId?: string,
): Promise<string> {
	if (actorRole !== Role.MANAGER) throw AppError.forbidden('Forbidden');
	const student = await db.studentProfile.findFirst({
		where: { userId: studentUserId, user: { deletedAt: null } },
		select: { id: true },
	});
	if (!student) throw AppError.notFound('Student not found');
	const courseWhere = {
		deletedAt: null,
		participants: { some: { studentId: student.id } },
	};
	let schoolId: string;
	if ('paymentPlanId' in resource) {
		const plan = await db.paymentPlan.findFirst({
			where: { id: resource.paymentPlanId, course: courseWhere },
			select: { id: true, course: { select: { schoolId: true } } },
		});
		if (!plan) throw AppError.notFound('Payment plan not found');
		schoolId = plan.course.schoolId;
	} else {
		const payment = await db.payment.findFirst({
			where: {
				id: resource.paymentId,
				paymentPlan: { course: courseWhere },
			},
			select: {
				id: true,
				paymentPlan: {
					select: { course: { select: { schoolId: true } } },
				},
			},
		});
		if (!payment) throw AppError.notFound('Payment not found');
		schoolId = payment.paymentPlan.course.schoolId;
	}
	await assertActorCanListStudentsForSchool(actorId, actorRole, schoolId, db);
	if (requestedSchoolId !== undefined && requestedSchoolId !== schoolId) {
		throw AppError.notFound('Payment school does not match');
	}
	return schoolId;
}
