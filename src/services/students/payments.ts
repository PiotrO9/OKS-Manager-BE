import { Prisma, Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import type { StudentPaymentsQuery } from '../../lib/validation/uuid';
import { assertActorCanListStudentsForSchool } from './access';
import type { StudentPaymentsDto } from './types';
import { mapPaymentStatus, paymentSortTime, toIsoOrNull } from './utils';

const prisma = getPrisma();

export async function listPaymentsForCurrentUser(
	actorId: string,
	actorRole: Role,
): Promise<StudentPaymentsDto> {
	if (actorRole !== Role.STUDENT) {
		return { payments: [] };
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
					_sortTime: paymentSortTime(payment),
				};
			}),
		),
	);

	payments.sort((a, b) => b._sortTime - a._sortTime);

	return {
		payments: payments.map(({ _sortTime, ...payment }) => payment),
	};
}
