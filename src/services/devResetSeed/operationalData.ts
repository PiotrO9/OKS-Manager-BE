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
	VehicleAvailabilityStatus,
	type InstructorProfile,
	type StudentProfile,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { createSeedRandom, getSeedRange, type SeedRandom } from './config';
import { addDays, dateOnly, pick } from './dateHelpers';
import {
	SeedSchedulePlanner,
	type SeedInstructorCalendar,
} from './schedulePlanner';
import { assertSeedScheduleIntegrity } from './scheduleIntegrity';
import type { SeedContext, SeedVehicle, UserWithProfiles } from './types';

type SeedCourse = {
	id: string;
	kind: CourseKind;
	instructor: UserWithProfiles & { instructorProfile: InstructorProfile };
	participants: Array<UserWithProfiles & { studentProfile: StudentProfile }>;
	schoolVehicles: SeedVehicle[];
};

const PRACTICE_LESSONS_PER_ANCHOR_DAY = 3;
const PRACTICE_SCHEDULE_START_OFFSET_DAYS = -7;

function courseKindForIndex(
	index: number,
	instructorCount: number,
	random: SeedRandom,
): CourseKind {
	if (index < instructorCount) {
		return index % 3 === 2 ? CourseKind.EXTRA : CourseKind.PRACTICAL;
	}
	if (index === instructorCount) return CourseKind.THEORY_GROUP;

	const roll = random.integerInclusive([1, 100]);
	if (roll <= 55) return CourseKind.PRACTICAL;
	if (roll <= 80) return CourseKind.THEORY_GROUP;
	return CourseKind.EXTRA;
}

function rotateTake<T>(items: readonly T[], count: number, start: number): T[] {
	return Array.from(
		{ length: Math.min(count, items.length) },
		(_, index) => items[(start + index) % items.length]!,
	);
}

function leastLoadedInstructor(
	instructors: SeedCourse['instructor'][],
	loadByInstructor: ReadonlyMap<string, number>,
): SeedCourse['instructor'] {
	return instructors.reduce((selected, candidate) => {
		const selectedLoad =
			loadByInstructor.get(selected.instructorProfile.id) ?? 0;
		const candidateLoad =
			loadByInstructor.get(candidate.instructorProfile.id) ?? 0;

		return candidateLoad < selectedLoad ? candidate : selected;
	});
}

function seededLessonStatus(
	start: Date,
	end: Date,
	index: number,
	now: Date,
): LessonStatus {
	if (index % 7 === 2) return LessonStatus.CANCELLED;

	return end <= now ? LessonStatus.COMPLETED : LessonStatus.SCHEDULED;
}

function seededEventStatus(
	start: Date,
	end: Date,
	index: number,
	now: Date,
): EventStatus {
	if (index % 5 === 2) return EventStatus.CANCELLED;

	return end <= now ? EventStatus.DONE : EventStatus.PLANNED;
}

export async function seedOperationalData(
	tx: Prisma.TransactionClient,
	context: SeedContext,
) {
	const schools = await tx.drivingSchool.findMany({
		orderBy: { name: 'asc' },
	});
	const [
		instructorSchools,
		studentSchools,
		workingHours,
		workingExceptions,
		instructorLeaves,
		schoolSettingsRows,
		courseTypeQualifications,
	] = await Promise.all([
		tx.instructorSchool.findMany({
			select: { instructorId: true, schoolId: true },
		}),
		tx.studentSchool.findMany({
			select: { studentId: true, schoolId: true },
		}),
		tx.instructorWorkingHoursDefault.findMany({
			select: {
				instructorId: true,
				dayOfWeek: true,
				startTime: true,
				endTime: true,
			},
		}),
		tx.instructorWorkingHours.findMany({
			select: {
				instructorId: true,
				date: true,
				startTime: true,
				endTime: true,
				isDayOff: true,
			},
		}),
		tx.instructorLeave.findMany({
			select: { instructorId: true, startDate: true, endDate: true },
		}),
		tx.schoolSettings.findMany({
			select: {
				schoolId: true,
				slotDurationMinutes: true,
				slotMustStartFullHour: true,
				practiceMinDurationMinutes: true,
				practiceMaxDurationMinutes: true,
				theoryMinDurationMinutes: true,
				theoryMaxDurationMinutes: true,
			},
		}),
		tx.courseType.findMany({
			select: {
				id: true,
				qualifiedInstructors: { select: { id: true } },
			},
		}),
	]);
	const calendars = new Map<string, SeedInstructorCalendar>();
	for (const instructor of context.instructors) {
		const instructorId = instructor.instructorProfile.id;
		calendars.set(instructorId, {
			windows: workingHours.filter(
				(row) => row.instructorId === instructorId,
			),
			exceptions: workingExceptions.filter(
				(row) => row.instructorId === instructorId,
			),
			leaves: instructorLeaves.filter(
				(row) => row.instructorId === instructorId,
			),
		});
	}
	const planner = new SeedSchedulePlanner(calendars);
	const settingsBySchool = new Map(
		schoolSettingsRows.map((settings) => [settings.schoolId, settings]),
	);
	const qualifiedInstructorsByCourseType = new Map(
		courseTypeQualifications.map((courseType) => [
			courseType.id,
			new Set(
				courseType.qualifiedInstructors.map(
					(instructor) => instructor.id,
				),
			),
		]),
	);
	const now = new Date();
	const random = createSeedRandom(
		`${context.seedPlan.randomSeed}:operational`,
	);
	const courses: Prisma.CourseCreateManyInput[] = [];
	const courseParticipants: Prisma.CourseParticipantCreateManyInput[] = [];
	const paymentPlans: Prisma.PaymentPlanCreateManyInput[] = [];
	const payments: Prisma.PaymentCreateManyInput[] = [];
	const lessons: Prisma.LessonCreateManyInput[] = [];
	const lessonRatings: Prisma.LessonRatingCreateManyInput[] = [];
	const instructorEvents: Prisma.InstructorEventCreateManyInput[] = [];
	const eventParticipants: Prisma.EventParticipantCreateManyInput[] = [];
	const instructorTimeBlocks: Prisma.InstructorTimeBlockCreateManyInput[] =
		[];
	const seedCourses: SeedCourse[] = [];

	for (let s = 0; s < schools.length; s += 1) {
		const school = schools[s]!;
		const schoolSettings = settingsBySchool.get(school.id);
		if (!schoolSettings) {
			throw new Error(`Missing settings for seeded school ${school.id}`);
		}
		const schoolInstructors = context.instructors.filter((instructor) =>
			instructorSchools.some(
				(link) =>
					link.instructorId === instructor.instructorProfile.id &&
					link.schoolId === school.id,
			),
		);
		const schoolStudents = context.students.filter((student) =>
			studentSchools.some(
				(link) =>
					link.studentId === student.studentProfile.id &&
					link.schoolId === school.id,
			),
		);
		const schoolVehicles = context.vehicles.filter(
			(vehicle) =>
				vehicle.schoolId === school.id &&
				vehicle.isActive &&
				vehicle.availabilityStatus === VehicleAvailabilityStatus.ACTIVE,
		);
		const eligibleCourseTypes = context.courseTypes.filter((courseType) => {
			const qualified = qualifiedInstructorsByCourseType.get(
				courseType.id,
			);

			return schoolInstructors.some((instructor) =>
				qualified?.has(instructor.instructorProfile.id),
			);
		});
		if (eligibleCourseTypes.length === 0) {
			throw new Error(
				`Seeded school ${school.id} has no qualified instructors`,
			);
		}
		if (eligibleCourseTypes.length < 2 && context.courseTypes.length >= 2) {
			throw new Error(
				`Seeded school ${school.id} must support at least two course types`,
			);
		}
		if (schoolVehicles.length === 0) {
			throw new Error(
				`Seeded school ${school.id} has no available vehicle`,
			);
		}
		const drivingCourseLoadByInstructor = new Map<string, number>();
		const theoryCourseLoadByInstructor = new Map<string, number>();

		const courseCount = context.seedPlan.schools[s]!.courses;
		const studentCategoryCodes = new Map<string, Set<string>>();
		for (let c = 0; c < courseCount; c += 1) {
			const courseId = randomUUID();
			const courseType =
				eligibleCourseTypes[c % eligibleCourseTypes.length]!;
			const kind = courseKindForIndex(
				c,
				schoolInstructors.length,
				random,
			);
			const isFinishedCourse = c === schoolInstructors.length;
			const qualified = qualifiedInstructorsByCourseType.get(
				courseType.id,
			);
			const eligibleInstructors = schoolInstructors.filter((instructor) =>
				qualified?.has(instructor.instructorProfile.id),
			);
			const courseLoadByInstructor =
				kind === CourseKind.THEORY_GROUP
					? theoryCourseLoadByInstructor
					: drivingCourseLoadByInstructor;
			const instructor = leastLoadedInstructor(
				eligibleInstructors,
				courseLoadByInstructor,
			);
			courseLoadByInstructor.set(
				instructor.instructorProfile.id,
				(courseLoadByInstructor.get(instructor.instructorProfile.id) ??
					0) + 1,
			);
			const requestedParticipantCount = random.integerInclusive(
				getSeedRange(
					'courseParticipants',
					context.seedPlan.options.courseParticipants,
				),
			);
			const minimumParticipantCount = Math.ceil(
				(2 * schoolStudents.length) / courseCount,
			);
			const participantLimit =
				kind === CourseKind.THEORY_GROUP
					? Math.min(schoolStudents.length, 20)
					: schoolStudents.length;
			const participantCount = Math.min(
				participantLimit,
				Math.max(requestedParticipantCount, minimumParticipantCount),
			);
			const rotatedStudents = rotateTake(
				schoolStudents,
				schoolStudents.length,
				(c * 3) % Math.max(1, schoolStudents.length),
			);
			const participants = [
				...schoolStudents.filter(
					(student) =>
						(studentCategoryCodes.get(student.studentProfile.id)
							?.size ?? 0) < 2,
				),
				...rotatedStudents,
			]
				.filter(
					(student, index, all) =>
						all.findIndex(
							(candidate) =>
								candidate.studentProfile.id ===
								student.studentProfile.id,
						) === index,
				)
				.slice(0, participantCount);
			const categoryCode = courseType.code.trim();

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
						? dateOnly(
								addDays(
									new Date(),
									isFinishedCourse ? -75 : -45 + c * 7,
								),
							)
						: null,
				theoryEndDate:
					kind === CourseKind.THEORY_GROUP
						? dateOnly(
								addDays(
									new Date(),
									isFinishedCourse ? -15 : -30 + c * 7,
								),
							)
						: null,
				instructorId: instructor.instructorProfile.id,
				status: isFinishedCourse ? 'finished' : 'active',
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
				const categories =
					studentCategoryCodes.get(student.studentProfile.id) ??
					new Set();
				categories.add(categoryCode);
				studentCategoryCodes.set(student.studentProfile.id, categories);
				courseParticipants.push({
					courseId,
					studentId: student.studentProfile.id,
					status: isFinishedCourse
						? CourseParticipantStatus.FINISHED
						: CourseParticipantStatus.ACTIVE,
				});
			}

			const paymentPlanId = randomUUID();
			const paymentPlanTotal = kind === CourseKind.EXTRA ? 900 : 3600;
			paymentPlans.push({
				id: paymentPlanId,
				courseId,
				totalAmount: paymentPlanTotal,
				type:
					c % 2 === 0
						? PaymentPlanType.INSTALLMENTS
						: PaymentPlanType.FULL,
				numberOfInstallments: c % 2 === 0 ? 4 : null,
				status: 'active',
			});

			const installments = c % 2 === 0 ? 4 : 1;
			for (let p = 0; p < installments; p += 1) {
				const dueDate = dateOnly(addDays(new Date(), -30 + p * 30));
				const paymentStatus =
					p === 0 && c % 5 === 0
						? PaymentStatus.FAILED
						: p < 2
							? PaymentStatus.PAID
							: PaymentStatus.PENDING;
				payments.push({
					id: randomUUID(),
					paymentPlanId,
					amount: paymentPlanTotal / installments,
					dueDate,
					paidAt:
						paymentStatus === PaymentStatus.PAID
							? addDays(dueDate, -2)
							: null,
					status: paymentStatus,
					method:
						paymentStatus === PaymentStatus.PAID
							? pick(['card', 'transfer', 'cash'], p)
							: null,
				});
			}

			if (kind !== CourseKind.THEORY_GROUP) {
				const lessonCount = random.integerInclusive(
					getSeedRange('lessons', context.seedPlan.options.lessons),
				);
				for (let l = 0; l < lessonCount; l += 1) {
					const lessonId = randomUUID();
					const student = pick(participants, l);
					const vehicle = random.pick(schoolVehicles);
					const lessonDurationMinutes =
						l % 3 === 0
							? Math.min(
									schoolSettings.practiceMaxDurationMinutes,
									Math.max(
										schoolSettings.practiceMinDurationMinutes,
										90,
									),
								)
							: schoolSettings.practiceMinDurationMinutes;
					const { start, end } = planner.reserve({
						anchor: addDays(
							new Date(),
							PRACTICE_SCHEDULE_START_OFFSET_DAYS +
								Math.floor(
									l / PRACTICE_LESSONS_PER_ANCHOR_DAY,
								) +
								(c % 3),
						),
						durationMinutes: lessonDurationMinutes,
						instructorId: instructor.instructorProfile.id,
						studentIds: [student.studentProfile.id],
						vehicleId: vehicle.id,
						slotIndex: l,
						stepMinutes: schoolSettings.slotMustStartFullHour
							? 60
							: schoolSettings.slotDurationMinutes,
					});
					const status = seededLessonStatus(start, end, l + c, now);
					lessons.push({
						id: lessonId,
						courseId,
						studentId: student.studentProfile.id,
						instructorId: instructor.instructorProfile.id,
						vehicleId: vehicle.id,
						lessonType: LessonType.PRACTICE,
						startTime: start,
						endTime: end,
						status,
					});

					if (status === LessonStatus.COMPLETED && l % 2 === 0) {
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
			}

			if (kind === CourseKind.THEORY_GROUP) {
				const eventCount = random.integerInclusive(
					getSeedRange('events', context.seedPlan.options.events),
				);
				for (let e = 0; e < eventCount; e += 1) {
					const eventId = randomUUID();
					const eventStudents = participants.slice(0, 10);
					const eventDurationMinutes =
						e % 2 === 0
							? schoolSettings.theoryMinDurationMinutes
							: schoolSettings.theoryMaxDurationMinutes;
					const eventSlot = planner.reserve({
						anchor: addDays(
							new Date(),
							isFinishedCourse
								? -65 + e * 7
								: -44 + c * 7 + e * 7,
						),
						durationMinutes: eventDurationMinutes,
						instructorId: instructor.instructorProfile.id,
						studentIds: eventStudents.map(
							(student) => student.studentProfile.id,
						),
						slotIndex: e + c,
						stepMinutes: schoolSettings.slotMustStartFullHour
							? 60
							: schoolSettings.slotDurationMinutes,
					});
					instructorEvents.push({
						id: eventId,
						instructorId: instructor.instructorProfile.id,
						schoolId: school.id,
						courseId,
						type: EventType.THEORY,
						startTime: eventSlot.start,
						endTime: eventSlot.end,
						capacity: 20,
						status: seededEventStatus(
							eventSlot.start,
							eventSlot.end,
							e + c,
							now,
						),
					});
					for (const student of eventStudents) {
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
			const blockCount = random.integerInclusive(
				getSeedRange('timeBlocks', context.seedPlan.options.timeBlocks),
			);
			for (let b = 0; b < blockCount; b += 1) {
				const blockSlot = planner.reserve({
					anchor: addDays(new Date(), b * 3 + i),
					durationMinutes: schoolSettings.slotDurationMinutes,
					instructorId: instructor.instructorProfile.id,
					slotIndex: b + 2,
					stepMinutes: schoolSettings.slotMustStartFullHour
						? 60
						: schoolSettings.slotDurationMinutes,
				});
				instructorTimeBlocks.push({
					id: randomUUID(),
					instructorId: instructor.instructorProfile.id,
					schoolId: school.id,
					startTime: blockSlot.start,
					endTime: blockSlot.end,
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

	assertSeedScheduleIntegrity({
		lessons,
		events: instructorEvents,
		eventParticipants,
		blocks: instructorTimeBlocks,
	});

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
