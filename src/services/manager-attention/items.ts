import { LessonStatus, LessonType, PaymentStatus } from '@prisma/client';
import { getPrisma } from '../../lib/prisma';
import { addDays, currentWeekRange, startOfLocalDay } from './dateUtils';
import { makeItem, personName } from './itemFactory';
import type { SortableAttentionItem } from './types';

const prisma = getPrisma();

export async function buildStudentItems(
	schoolId: string,
): Promise<SortableAttentionItem[]> {
	const students = await prisma.studentProfile.findMany({
		where: {
			user: { deletedAt: null, isActive: true },
			studentSchools: {
				some: { schoolId, school: { deletedAt: null } },
			},
		},
		select: {
			id: true,
			userId: true,
			pkkNumber: true,
			user: {
				select: {
					firstName: true,
					lastName: true,
					email: true,
				},
			},
			courseParticipants: {
				where: { course: { schoolId, deletedAt: null } },
				select: { id: true },
				take: 1,
			},
			lessons: {
				where: {
					deletedAt: null,
					lessonType: LessonType.PRACTICE,
					status: { not: LessonStatus.CANCELLED },
					course: { schoolId, deletedAt: null },
				},
				select: { id: true },
				take: 1,
			},
		},
	});

	return students.flatMap((student) => {
		const label = personName(student.user);
		const actionTo = `/manager/students/${student.userId}`;
		const items: SortableAttentionItem[] = [];

		if (!student.pkkNumber?.trim()) {
			items.push(
				makeItem({
					id: `student_missing_pkk:${student.id}`,
					type: 'student_missing_pkk',
					priority: 'todo',
					title: 'Brakuje numeru PKK',
					description: `${label} nie ma uzupełnionego numeru PKK.`,
					entityId: student.userId,
					entityLabel: label,
					actionTo,
				}),
			);
		}

		if (student.courseParticipants.length === 0) {
			items.push(
				makeItem({
					id: `student_missing_course:${student.id}`,
					type: 'student_missing_course',
					priority: 'todo',
					title: 'Kursant bez kursu',
					description: `${label} nie jest przypisany do żadnego kursu w tej OSK.`,
					entityId: student.userId,
					entityLabel: label,
					actionTo,
				}),
			);
		}

		if (student.lessons.length === 0) {
			items.push(
				makeItem({
					id: `student_missing_first_lesson:${student.id}`,
					type: 'student_missing_first_lesson',
					priority: 'todo',
					title: 'Brak zaplanowanej pierwszej jazdy',
					description: `${label} nie ma jeszcze zaplanowanej jazdy praktycznej.`,
					entityId: student.userId,
					entityLabel: label,
					actionTo,
				}),
			);
		}

		return items;
	});
}

export async function buildPaymentItems(
	schoolId: string,
	today: Date,
): Promise<SortableAttentionItem[]> {
	const dayStart = startOfLocalDay(today);
	const dueSoonEnd = addDays(dayStart, 7);
	const participants = await prisma.courseParticipant.findMany({
		where: {
			course: { schoolId, deletedAt: null },
			student: { user: { deletedAt: null, isActive: true } },
		},
		select: {
			student: {
				select: {
					userId: true,
					user: {
						select: {
							firstName: true,
							lastName: true,
							email: true,
						},
					},
				},
			},
			course: {
				select: {
					name: true,
					paymentPlans: {
						where: { status: 'active' },
						select: {
							id: true,
							currency: true,
							payments: {
								where: {
									status: { not: PaymentStatus.PAID },
									dueDate: { not: null },
								},
								select: {
									id: true,
									amount: true,
									dueDate: true,
								},
							},
						},
					},
				},
			},
		},
	});

	const items: SortableAttentionItem[] = [];

	for (const participant of participants) {
		const label = personName(participant.student.user);
		const actionTo = `/manager/students/${participant.student.userId}`;

		for (const plan of participant.course.paymentPlans) {
			for (const payment of plan.payments) {
				if (!payment.dueDate) continue;

				const amount = `${payment.amount.toString()} ${plan.currency}`;
				const base = {
					entityId: participant.student.userId,
					entityLabel: label,
					actionTo,
					dueDate: payment.dueDate,
				};

				if (payment.dueDate < dayStart) {
					items.push(
						makeItem({
							...base,
							id: `payment_overdue:${payment.id}:${participant.student.userId}`,
							type: 'payment_overdue',
							priority: 'urgent',
							title: 'Zaległa płatność',
							description: `${label} ma zaległą płatność ${amount} za kurs ${participant.course.name}.`,
						}),
					);
				} else if (payment.dueDate <= dueSoonEnd) {
					items.push(
						makeItem({
							...base,
							id: `payment_due_soon:${payment.id}:${participant.student.userId}`,
							type: 'payment_due_soon',
							priority: 'todo',
							title: 'Płatność w najbliższych 7 dniach',
							description: `${label} ma nadchodzącą płatność ${amount} za kurs ${participant.course.name}.`,
						}),
					);
				}
			}
		}
	}

	return items;
}

export async function buildVehicleItems(
	schoolId: string,
	today: Date,
): Promise<SortableAttentionItem[]> {
	const dayStart = startOfLocalDay(today);
	const expiringEnd = addDays(dayStart, 30);
	const vehicles = await prisma.vehicle.findMany({
		where: {
			schoolId,
			isActive: true,
			OR: [
				{ insuranceDate: { lte: expiringEnd } },
				{ inspectionDate: { lte: expiringEnd } },
			],
		},
		select: {
			id: true,
			name: true,
			registrationNumber: true,
			insuranceDate: true,
			inspectionDate: true,
		},
	});

	return vehicles.flatMap((vehicle) => {
		const label = `${vehicle.name} (${vehicle.registrationNumber})`;
		const actionTo = `/vehicles/${vehicle.id}`;
		const docs: Array<{ kind: string; date: Date | null }> = [
			{ kind: 'OC', date: vehicle.insuranceDate },
			{ kind: 'badanie techniczne', date: vehicle.inspectionDate },
		];

		return docs.flatMap(({ kind, date }) => {
			if (!date || date > expiringEnd) return [];

			const expired = date < dayStart;

			return makeItem({
				id: `vehicle_document_${expired ? 'expired' : 'expiring'}:${vehicle.id}:${kind}`,
				type: expired
					? 'vehicle_document_expired'
					: 'vehicle_document_expiring',
				priority: expired ? 'urgent' : 'info',
				title: expired
					? `Pojazd po terminie: ${kind}`
					: `Zbliża się termin: ${kind}`,
				description: `${label} wymaga sprawdzenia dokumentu: ${kind}.`,
				entityId: vehicle.id,
				entityLabel: label,
				dueDate: date,
				actionTo,
			});
		});
	});
}

export async function buildInstructorItems(
	schoolId: string,
	today: Date,
): Promise<SortableAttentionItem[]> {
	const week = currentWeekRange(today);
	const instructors = await prisma.instructorProfile.findMany({
		where: {
			user: { deletedAt: null, isActive: true },
			instructorSchools: {
				some: { schoolId, school: { deletedAt: null } },
			},
		},
		select: {
			id: true,
			userId: true,
			user: {
				select: {
					firstName: true,
					lastName: true,
					email: true,
				},
			},
			workingHours: {
				where: {
					date: {
						gte: week.start,
						lt: week.end,
					},
				},
				select: { id: true },
				take: 1,
			},
		},
	});

	return instructors
		.filter((instructor) => instructor.workingHours.length === 0)
		.map((instructor) => {
			const label = personName(instructor.user);

			return makeItem({
				id: `instructor_missing_availability:${instructor.id}`,
				type: 'instructor_missing_availability',
				priority: 'todo',
				title: 'Instruktor bez dostępności w tym tygodniu',
				description: `${label} nie ma skonfigurowanej tygodniowej dostępności.`,
				entityId: instructor.id,
				entityLabel: label,
				actionTo: `/manager/instructors/${instructor.id}`,
			});
		});
}

export async function buildRatingItems(
	schoolId: string,
	today: Date,
): Promise<SortableAttentionItem[]> {
	const since = addDays(startOfLocalDay(today), -14);
	const ratings = await prisma.lessonRating.findMany({
		where: {
			rating: { lte: 2 },
			createdAt: { gte: since },
			lesson: {
				deletedAt: null,
				lessonType: LessonType.PRACTICE,
				status: LessonStatus.COMPLETED,
				course: { schoolId, deletedAt: null },
			},
		},
		select: {
			id: true,
			rating: true,
			createdAt: true,
			student: {
				select: {
					userId: true,
					user: {
						select: {
							firstName: true,
							lastName: true,
							email: true,
						},
					},
				},
			},
			instructor: {
				select: {
					user: {
						select: {
							firstName: true,
							lastName: true,
							email: true,
						},
					},
				},
			},
		},
	});

	return ratings.map((rating) => {
		const studentLabel = personName(rating.student.user);
		const instructorLabel = personName(rating.instructor.user);

		return makeItem({
			id: `low_lesson_rating:${rating.id}`,
			type: 'low_lesson_rating',
			priority: 'urgent',
			title: 'Niska ocena lekcji',
			description: `${studentLabel} wystawił(a) ocenę ${rating.rating}/5 instruktorowi ${instructorLabel}.`,
			entityId: rating.id,
			entityLabel: studentLabel,
			dueDate: rating.createdAt,
			actionTo: '/manager/reviews',
		});
	});
}
