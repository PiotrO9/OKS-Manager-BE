import { Role, type Prisma } from '@prisma/client';
import { AppError } from '../lib/http/AppError';

type Tx = Prisma.TransactionClient;

function eventTitle(type: string): string {
	return type === 'DRIVE' ? 'Jazda' : 'Teoria';
}

function blockTitle(type: string): string {
	if (type === 'BREAK') return 'Przerwa';
	if (type === 'MEETING') return 'Spotkanie';
	return 'Inny blok czasu';
}

export type AccountObligation = {
	type: 'LESSON' | 'COURSE' | 'EVENT' | 'PAYMENT' | 'TIME_BLOCK';
	id: string;
	title: string;
	startTime: Date | null;
	endTime: Date | null;
	amount?: string;
	currency?: string;
	status?: string;
};

/** The same predicates are used by the read view and the archive guard. */
export async function findManagerAccountObligations(
	tx: Tx,
	userId: string,
	role: Role,
	schoolId: string,
): Promise<AccountObligation[]> {
	const now = new Date();
	if (role === Role.STUDENT) {
		const profile = await tx.studentProfile.findUnique({
			where: { userId },
			select: { id: true },
		});
		if (!profile) throw AppError.notFound('Student profile not found');
		const [lessons, courses, events, payments] = await Promise.all([
			tx.lesson.findMany({
				where: {
					studentId: profile.id,
					startTime: { gte: now },
					deletedAt: null,
					course: { schoolId },
				},
				select: {
					id: true,
					startTime: true,
					endTime: true,
					course: { select: { name: true } },
				},
			}),
			tx.courseParticipant.findMany({
				where: {
					studentId: profile.id,
					status: 'ACTIVE',
					course: { schoolId, deletedAt: null },
				},
				select: { course: { select: { id: true, name: true } } },
			}),
			tx.eventParticipant.findMany({
				where: {
					studentId: profile.id,
					event: {
						schoolId,
						isActive: true,
						startTime: { gte: now },
					},
				},
				select: {
					event: {
						select: {
							id: true,
							type: true,
							startTime: true,
							endTime: true,
						},
					},
				},
			}),
			tx.payment.findMany({
				where: {
					status: 'PENDING',
					paymentPlan: {
						course: {
							schoolId,
							participants: { some: { studentId: profile.id } },
						},
					},
				},
				select: {
					id: true,
					amount: true,
					dueDate: true,
					paymentPlan: {
						select: {
							currency: true,
							course: { select: { name: true } },
						},
					},
				},
			}),
		]);
		return [
			...lessons.map((lesson) => ({
				type: 'LESSON' as const,
				id: lesson.id,
				title: `Lekcja · ${lesson.course.name}`,
				startTime: lesson.startTime,
				endTime: lesson.endTime,
			})),
			...courses.map(({ course }) => ({
				type: 'COURSE' as const,
				id: course.id,
				title: course.name,
				startTime: null,
				endTime: null,
			})),
			...events.map(({ event }) => ({
				type: 'EVENT' as const,
				id: event.id,
				title: `Wydarzenie · ${eventTitle(event.type)}`,
				startTime: event.startTime,
				endTime: event.endTime,
			})),
			...payments.map((payment) => ({
				type: 'PAYMENT' as const,
				id: payment.id,
				title: `Płatność · ${payment.paymentPlan.course.name}`,
				startTime: payment.dueDate,
				endTime: null,
				amount: payment.amount.toString(),
				currency: payment.paymentPlan.currency,
				status: 'PENDING',
			})),
		];
	}

	const profile = await tx.instructorProfile.findUnique({
		where: { userId },
		select: { id: true },
	});
	if (!profile) throw AppError.notFound('Instructor profile not found');
	const [lessons, courses, events, blocks] = await Promise.all([
		tx.lesson.findMany({
			where: {
				instructorId: profile.id,
				startTime: { gte: now },
				deletedAt: null,
				course: { schoolId },
			},
			select: {
				id: true,
				startTime: true,
				endTime: true,
				course: { select: { name: true } },
			},
		}),
		tx.course.findMany({
			where: {
				instructorId: profile.id,
				schoolId,
				deletedAt: null,
				status: 'active',
			},
			select: { id: true, name: true },
		}),
		tx.instructorEvent.findMany({
			where: {
				instructorId: profile.id,
				schoolId,
				isActive: true,
				startTime: { gte: now },
			},
			select: { id: true, type: true, startTime: true, endTime: true },
		}),
		tx.instructorTimeBlock.findMany({
			where: {
				instructorId: profile.id,
				schoolId,
				startTime: { gte: now },
			},
			select: { id: true, type: true, startTime: true, endTime: true },
		}),
	]);
	return [
		...lessons.map((lesson) => ({
			type: 'LESSON' as const,
			id: lesson.id,
			title: `Lekcja · ${lesson.course.name}`,
			startTime: lesson.startTime,
			endTime: lesson.endTime,
		})),
		...courses.map((course) => ({
			type: 'COURSE' as const,
			id: course.id,
			title: course.name,
			startTime: null,
			endTime: null,
		})),
		...events.map((event) => ({
			type: 'EVENT' as const,
			id: event.id,
			title: `Wydarzenie · ${eventTitle(event.type)}`,
			startTime: event.startTime,
			endTime: event.endTime,
		})),
		...blocks.map((block) => ({
			type: 'TIME_BLOCK' as const,
			id: block.id,
			title: `Blok czasu · ${blockTitle(block.type)}`,
			startTime: block.startTime,
			endTime: block.endTime,
		})),
	];
}
