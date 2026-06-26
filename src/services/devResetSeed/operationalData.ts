import {
	CourseKind,
	CourseParticipantStatus,
	EventStatus,
	EventType,
	InstructorTimeBlockType,
	LessonStatus,
	LessonType,
	PaymentPlanType,
	PaymentStatus,
	Prisma,
	type InstructorProfile,
	type StudentProfile,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { addDays, atTime, dateOnly, pick } from './dateHelpers';
import type { SeedContext, SeedVehicle, UserWithProfiles } from './types';

type SeedCourse = {
	id: string;
	kind: CourseKind;
	instructor: UserWithProfiles & { instructorProfile: InstructorProfile };
	participants: Array<UserWithProfiles & { studentProfile: StudentProfile }>;
	schoolVehicles: SeedVehicle[];
};

export async function seedOperationalData(
	tx: Prisma.TransactionClient,
	context: SeedContext,
) {
	const schools = await tx.drivingSchool.findMany({ orderBy: { name: 'asc' } });
	const courses: Prisma.CourseCreateManyInput[] = [];
	const courseParticipants: Prisma.CourseParticipantCreateManyInput[] = [];
	const paymentPlans: Prisma.PaymentPlanCreateManyInput[] = [];
	const payments: Prisma.PaymentCreateManyInput[] = [];
	const lessons: Prisma.LessonCreateManyInput[] = [];
	const lessonRatings: Prisma.LessonRatingCreateManyInput[] = [];
	const instructorEvents: Prisma.InstructorEventCreateManyInput[] = [];
	const eventParticipants: Prisma.EventParticipantCreateManyInput[] = [];
	const instructorTimeBlocks: Prisma.InstructorTimeBlockCreateManyInput[] = [];
	const seedCourses: SeedCourse[] = [];

	for (let s = 0; s < schools.length; s += 1) {
		const school = schools[s]!;
		const schoolInstructors = context.instructors.filter(
			(_, index) => index % schools.length === s,
		);
		const schoolStudents = context.students.filter(
			(_, index) => index % schools.length === s,
		);
		const schoolVehicles = context.vehicles.filter(
			(vehicle) => vehicle.schoolId === school.id && vehicle.isActive,
		);

		for (let c = 0; c < 8; c += 1) {
			const courseId = randomUUID();
			const courseType = context.courseTypes[c % context.courseTypes.length]!;
			const kind = pick(
				[
					CourseKind.THEORY_GROUP,
					CourseKind.PRACTICAL,
					CourseKind.EXTRA,
				],
				c,
			);
			const instructor = pick(schoolInstructors, c);
			const participants = schoolStudents.slice(c * 2, c * 2 + 12);

			courses.push({
				id: courseId,
				schoolId: school.id,
				name: `${courseType.name} - grupa ${s + 1}/${c + 1}`,
				category: courseType.code,
				courseTypeId: courseType.id,
				kind,
				totalHours:
					kind === CourseKind.THEORY_GROUP
						? 30
						: kind === CourseKind.EXTRA
							? 10
							: 30,
				capacity: kind === CourseKind.THEORY_GROUP ? 20 : null,
				theoryStartDate:
					kind === CourseKind.THEORY_GROUP
						? dateOnly(addDays(new Date(), -45 + c * 7))
						: null,
				theoryEndDate:
					kind === CourseKind.THEORY_GROUP
						? dateOnly(addDays(new Date(), -30 + c * 7))
						: null,
				instructorId: instructor.instructorProfile.id,
				status: c % 7 === 0 ? 'finished' : 'active',
			});

			seedCourses.push({
				id: courseId,
				kind,
				instructor,
				participants,
				schoolVehicles,
			});

			for (let p = 0; p < participants.length; p += 1) {
				const student = participants[p]!;
				courseParticipants.push({
					courseId,
					studentId: student.studentProfile.id,
					status:
						c % 7 === 0 || p % 9 === 0
							? CourseParticipantStatus.FINISHED
							: CourseParticipantStatus.ACTIVE,
				});
			}

			const paymentPlanId = randomUUID();
			paymentPlans.push({
				id: paymentPlanId,
				courseId,
				totalAmount: kind === CourseKind.EXTRA ? 900 : 3600,
				type:
					c % 2 === 0 ? PaymentPlanType.INSTALLMENTS : PaymentPlanType.FULL,
				numberOfInstallments: c % 2 === 0 ? 4 : null,
				status: 'active',
			});

			const installments = c % 2 === 0 ? 4 : 1;
			for (let p = 0; p < installments; p += 1) {
				payments.push({
					id: randomUUID(),
					paymentPlanId,
					amount: installments === 1 ? 3600 : 900,
					dueDate: dateOnly(addDays(new Date(), -30 + p * 30)),
					paidAt: p < 2 ? addDays(new Date(), -28 + p * 30) : null,
					status:
						p < 2
							? PaymentStatus.PAID
							: p === 2 && c % 5 === 0
								? PaymentStatus.FAILED
								: PaymentStatus.PENDING,
					method: p < 2 ? pick(['card', 'transfer', 'cash'], p) : null,
				});
			}

			for (let l = 0; l < Math.min(18, participants.length * 2); l += 1) {
				const lessonId = randomUUID();
				const student = pick(participants, l);
				const lessonDate = addDays(new Date(), -35 + c * 4 + l);
				const start = atTime(lessonDate, 8 + (l % 8));
				const end = atTime(lessonDate, 9 + (l % 8), l % 3 === 0 ? 30 : 0);
				const status = pick(
					[
						LessonStatus.COMPLETED,
						LessonStatus.SCHEDULED,
						LessonStatus.CANCELLED,
					],
					l + c,
				);
				const lessonType =
					kind === CourseKind.THEORY_GROUP
						? LessonType.THEORY
						: LessonType.PRACTICE;
				lessons.push({
					id: lessonId,
					courseId,
					studentId: student.studentProfile.id,
					instructorId: instructor.instructorProfile.id,
					vehicleId: pick(schoolVehicles, l)?.id ?? null,
					lessonType,
					startTime: start,
					endTime: end,
					status,
				});

				if (
					status === LessonStatus.COMPLETED &&
					lessonType === LessonType.PRACTICE &&
					l % 2 === 0
				) {
					lessonRatings.push({
						id: randomUUID(),
						lessonId,
						studentId: student.studentProfile.id,
						instructorId: instructor.instructorProfile.id,
						rating: 4 + (l % 2),
						comment:
							l % 4 === 0
								? 'Bardzo konkretne wskazowki po jezdzie.'
								: null,
					});
				}
			}

			if (kind === CourseKind.THEORY_GROUP) {
				for (let e = 0; e < 3; e += 1) {
					const eventId = randomUUID();
					instructorEvents.push({
						id: eventId,
						instructorId: instructor.instructorProfile.id,
						courseId,
						type: EventType.THEORY,
						startTime: atTime(addDays(new Date(), -7 + e * 7), 17),
						endTime: atTime(addDays(new Date(), -7 + e * 7), 19),
						capacity: 20,
						status: pick(
							[
								EventStatus.DONE,
								EventStatus.PLANNED,
								EventStatus.CANCELLED,
							],
							e + c,
						),
					});
					for (const student of participants.slice(0, 10)) {
						eventParticipants.push({
							id: randomUUID(),
							eventId,
							studentId: student.studentProfile.id,
						});
					}
				}
			}
		}

		for (let i = 0; i < schoolInstructors.length; i += 1) {
			const instructor = schoolInstructors[i]!;
			for (let b = 0; b < 4; b += 1) {
				instructorTimeBlocks.push({
					id: randomUUID(),
					instructorId: instructor.instructorProfile.id,
					schoolId: school.id,
					startTime: atTime(addDays(new Date(), b * 3 + i), 12),
					endTime: atTime(addDays(new Date(), b * 3 + i), 13),
					type: pick(
						[
							InstructorTimeBlockType.BREAK,
							InstructorTimeBlockType.MEETING,
							InstructorTimeBlockType.OTHER,
						],
						b,
					),
				});
			}
		}
	}

	if (courses.length > 0) await tx.course.createMany({ data: courses });
	if (courseParticipants.length > 0) {
		await tx.courseParticipant.createMany({ data: courseParticipants });
	}
	if (paymentPlans.length > 0) {
		await tx.paymentPlan.createMany({ data: paymentPlans });
	}
	if (payments.length > 0) await tx.payment.createMany({ data: payments });
	if (lessons.length > 0) await tx.lesson.createMany({ data: lessons });
	if (lessonRatings.length > 0) {
		await tx.lessonRating.createMany({ data: lessonRatings });
	}
	if (instructorEvents.length > 0) {
		await tx.instructorEvent.createMany({ data: instructorEvents });
	}
	if (eventParticipants.length > 0) {
		await tx.eventParticipant.createMany({ data: eventParticipants });
	}
	if (instructorTimeBlocks.length > 0) {
		await tx.instructorTimeBlock.createMany({ data: instructorTimeBlocks });
	}

	return {
		courses: seedCourses.length,
		courseParticipants: courseParticipants.length,
		lessons: lessons.length,
		events: instructorEvents.length,
		eventParticipants: eventParticipants.length,
		paymentPlans: paymentPlans.length,
		payments: payments.length,
		ratings: lessonRatings.length,
		instructorTimeBlocks: instructorTimeBlocks.length,
	};
}
