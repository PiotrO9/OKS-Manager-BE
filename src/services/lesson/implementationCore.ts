import {
	CourseKind,
	CourseParticipantStatus,
	EventType,
	LessonStatus,
	LessonType,
	Prisma,
	Role,
	VehicleAvailabilityStatus,
} from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { assertInstructorQualifiedForCourseType } from '../../lib/instructorCourseQualification';
import { validateVehicleForInstructor } from '../../lib/vehicle.helpers';
import { getPrisma } from '../../lib/prisma';
import type {
	BookLessonBody,
	BookOwnLessonBody,
	UpdateLessonBody,
} from '../../schemas/lesson.schemas';
import {
	assertCourseDrivingPackageHoursAllowNewLesson,
	assertStudentNoScheduleOverlap,
} from '../../lib/lesson-scheduling';
import { assertInstructorTimeWindowAvailable } from '../instructor-availability.service';

const prisma = getPrisma();

export function formatYYYYMMDD(date: Date): string {
	const y = date.getUTCFullYear();
	const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
	const d = String(date.getUTCDate()).padStart(2, '0');
	return `${y}-${mo}-${d}`;
}

export function yyyymmddToDate(dateStr: string): Date {
	const [y, mo, d] = dateStr.split('-').map(Number);
	return new Date(Date.UTC(y ?? 0, (mo ?? 1) - 1, d ?? 1));
}

export function addDaysYyyymmdd(dateStr: string, days: number): string {
	const d = yyyymmddToDate(dateStr);
	d.setUTCDate(d.getUTCDate() + days);
	return formatYYYYMMDD(d);
}

export function compareYyyymmdd(a: string, b: string): number {
	if (a < b) {
		return -1;
	}
	if (a > b) {
		return 1;
	}
	return 0;
}

export function utcTodayYyyymmdd(): string {
	return formatYYYYMMDD(new Date());
}

export type LessonDto = {
	id: string;
	courseId: string;
	studentId: string;
	instructorId: string;
	vehicleId: string | null;
	lessonType: LessonType;
	startTime: string;
	endTime: string;
	status: string;
	createdAt: string;
};

/** Profil + dane konta użytkownika — odpowiedź GET /lessons/:id (instruktor / kursant). */
export type LessonPersonDetailDto = {
	/** `InstructorProfile.id` lub `StudentProfile.id`. */
	id: string;
	/** `User.id` — nawigacja do `/students/:userId` itd. */
	userId: string;
	firstName: string;
	lastName: string;
	email: string;
	phone: string | null;
};

/** Pełny rekord pojazdu — zagnieżdżony w `lesson` przy GET /lessons/:id. */
export type LessonVehicleDetailDto = {
	id: string;
	schoolId: string;
	name: string;
	registrationNumber: string;
	inspectionDate: string | null;
	insuranceDate: string | null;
	brand: string | null;
	model: string | null;
	photoUrl: string | null;
	modelYear: number | null;
	mileageKm: number | null;
	note: string | null;
	isActive: boolean;
	createdAt: string;
};

/** GET /lessons/:id — bez `studentId` / `instructorId` / `vehicleId` (są w `student.id`, `instructor.id`, `vehicle`). */
export type LessonWithDetailsDto = Omit<
	LessonDto,
	'studentId' | 'instructorId' | 'vehicleId'
> & {
	instructor: LessonPersonDetailDto;
	student: LessonPersonDetailDto;
	vehicle: LessonVehicleDetailDto | null;
};

type CourseForBooking = {
	id: string;
	schoolId: string;
	instructorId: string | null;
	courseTypeId: string;
	kind: CourseKind;
	totalHours: number;
};

type DbClient = Prisma.TransactionClient | typeof prisma;

async function assertActorCanBookLessonForCourse(
	actor: { id: string; role: Role },
	schoolId: string,
): Promise<void> {
	if (actor.role === Role.ADMIN) {
		return;
	}
	if (actor.role === Role.MANAGER) {
		const school = await prisma.drivingSchool.findFirst({
			where: { id: schoolId, ownerId: actor.id, deletedAt: null },
			select: { id: true },
		});
		if (!school) {
			throw AppError.forbidden('Forbidden');
		}
		return;
	}
	throw AppError.forbidden('Forbidden');
}

function assertLessonTimeIsBookable(
	start: Date,
	courseSchoolId: string,
): Promise<void> {
	if (start.getTime() < Date.now()) {
		throw AppError.badRequest('Lesson time must be in the future');
	}

	return assertLessonDateInsideBookingWindow(start, courseSchoolId);
}

async function assertLessonDateInsideBookingWindow(
	start: Date,
	courseSchoolId: string,
): Promise<void> {
	const settings = await prisma.schoolSettings.findUnique({
		where: { schoolId: courseSchoolId },
		select: { bookingMaxDaysAhead: true },
	});
	const bookingMaxDaysAhead = settings?.bookingMaxDaysAhead ?? 30;
	const lessonDay = formatYYYYMMDD(start);
	const today = utcTodayYyyymmdd();
	const maxBookable = addDaysYyyymmdd(today, bookingMaxDaysAhead);
	if (compareYyyymmdd(lessonDay, today) < 0) {
		throw AppError.badRequest('Lesson date cannot be in the past');
	}
	if (compareYyyymmdd(lessonDay, maxBookable) > 0) {
		throw AppError.badRequest('Lesson date is outside booking window');
	}
}

function assertCourseCanBeSelfBooked(course: CourseForBooking): void {
	if (course.kind === CourseKind.THEORY_GROUP) {
		throw AppError.badRequest('Course does not allow practice lessons');
	}
}

async function loadCourseForBooking(
	courseId: string,
): Promise<CourseForBooking> {
	const course = await prisma.course.findFirst({
		where: { id: courseId, deletedAt: null },
		select: {
			id: true,
			schoolId: true,
			instructorId: true,
			courseTypeId: true,
			kind: true,
			totalHours: true,
		},
	});

	if (!course) {
		throw AppError.notFound('Course not found');
	}

	return course;
}

async function loadStudentProfileIdForUser(userId: string): Promise<string> {
	const studentUser = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			id: true,
			role: true,
			deletedAt: true,
			isActive: true,
			studentProfile: { select: { id: true } },
		},
	});

	if (!studentUser || studentUser.deletedAt !== null) {
		throw AppError.notFound('User not found');
	}

	if (!studentUser.isActive) {
		throw AppError.forbidden('Account is disabled');
	}

	if (studentUser.role !== Role.STUDENT || !studentUser.studentProfile) {
		throw AppError.badRequest('studentId must be a student user');
	}

	return studentUser.studentProfile.id;
}

async function assertInstructorCanBookCourse(
	instructorId: string,
	course: CourseForBooking,
): Promise<void> {
	const instructorLink = await prisma.instructorSchool.findFirst({
		where: {
			instructorId,
			schoolId: course.schoolId,
		},
		select: { id: true },
	});

	if (!instructorLink) {
		throw AppError.badRequest(
			'instructor does not belong to this driving school',
		);
	}

	if (course.instructorId != null && course.instructorId !== instructorId) {
		throw AppError.badRequest(
			'instructor does not match course assigned instructor',
		);
	}

	await assertInstructorQualifiedForCourseType(
		instructorId,
		course.courseTypeId,
	);
}

async function assertStudentParticipatesInCourse(
	courseId: string,
	studentProfileId: string,
	options?: { requireActive?: boolean },
): Promise<void> {
	const participant = await prisma.courseParticipant.findFirst({
		where: {
			courseId,
			studentId: studentProfileId,
			...(options?.requireActive
				? { status: CourseParticipantStatus.ACTIVE }
				: {}),
		},
		select: { id: true },
	});

	if (!participant) {
		throw options?.requireActive
			? AppError.forbidden('Forbidden')
			: AppError.notFound('Student is not enrolled in this course');
	}
}

export async function vehicleHasBookingConflict(
	db: DbClient,
	vehicleId: string,
	start: Date,
	end: Date,
	options?: { excludeLessonId?: string },
): Promise<boolean> {
	const vehicleLessonConflict = await db.lesson.findFirst({
		where: {
			vehicleId,
			status: { not: LessonStatus.CANCELLED },
			startTime: { lt: end },
			endTime: { gt: start },
			...(options?.excludeLessonId
				? { id: { not: options.excludeLessonId } }
				: {}),
		},
		select: { id: true },
	});
	if (vehicleLessonConflict) {
		return true;
	}

	const vehicleEventConflict = await db.instructorEvent.findFirst({
		where: {
			vehicleId,
			type: EventType.DRIVE,
			isActive: true,
			startTime: { lt: end },
			endTime: { gt: start },
		},
		select: { id: true },
	});

	return vehicleEventConflict !== null;
}

async function assertVehicleAvailableForBooking(
	db: DbClient,
	instructorId: string,
	vehicleId: string,
	courseSchoolId: string,
	start: Date,
	end: Date,
	options?: { excludeLessonId?: string },
): Promise<void> {
	const vehicleInSchool = await db.vehicle.findFirst({
		where: {
			id: vehicleId,
			schoolId: courseSchoolId,
			isActive: true,
			availabilityStatus: VehicleAvailabilityStatus.ACTIVE,
		},
		select: { id: true },
	});
	if (!vehicleInSchool) {
		throw AppError.badRequest('Vehicle is not for this driving school');
	}
	await validateVehicleForInstructor(instructorId, vehicleId, db);

	const hasConflict = await vehicleHasBookingConflict(
		db,
		vehicleId,
		start,
		end,
		{
			excludeLessonId: options?.excludeLessonId,
		},
	);
	if (hasConflict) {
		throw AppError.conflict('Vehicle is already in use');
	}
}

export async function findAvailableVehicleIdForStudentBooking(
	db: DbClient,
	instructorId: string,
	schoolId: string,
	start: Date,
	end: Date,
): Promise<string> {
	const school = await db.drivingSchool.findUnique({
		where: { id: schoolId },
		select: { defaultVehicleId: true },
	});

	const candidates = await db.vehicle.findMany({
		where: {
			schoolId,
			isActive: true,
			availabilityStatus: VehicleAvailabilityStatus.ACTIVE,
		},
		select: { id: true },
		orderBy: { createdAt: 'asc' },
	});

	const ids = candidates.map((v) => v.id);
	const orderedIds =
		school?.defaultVehicleId && ids.includes(school.defaultVehicleId)
			? [
				school.defaultVehicleId,
				...ids.filter((id) => id !== school.defaultVehicleId),
			]
			: ids;

	for (const vehicleId of orderedIds) {
		try {
			await validateVehicleForInstructor(instructorId, vehicleId, db);
		} catch {
			continue;
		}

		if (!(await vehicleHasBookingConflict(db, vehicleId, start, end))) {
			return vehicleId;
		}
	}

	throw AppError.conflict('No available vehicle for this time slot');
}

async function createPracticeLessonForStudent(input: {
	course: CourseForBooking;
	studentProfileId: string;
	instructorId: string;
	start: Date;
	end: Date;
	resolveVehicleId: (tx: Prisma.TransactionClient) => Promise<string>;
}): Promise<{ lesson: LessonDto }> {
	const {
		course,
		studentProfileId,
		instructorId,
		start,
		end,
		resolveVehicleId,
	} = input;

	const row = await prisma.$transaction(async (tx) => {
		await assertInstructorTimeWindowAvailable(instructorId, start, end, tx);

		await assertStudentNoScheduleOverlap(tx, studentProfileId, start, end);
		await assertCourseDrivingPackageHoursAllowNewLesson(
			tx,
			course.id,
			studentProfileId,
			course.kind,
			course.totalHours,
			start,
			end,
		);

		const lessonConflict = await tx.lesson.findFirst({
			where: {
				instructorId,
				status: { not: LessonStatus.CANCELLED },
				startTime: { lt: end },
				endTime: { gt: start },
			},
			select: { id: true },
		});
		if (lessonConflict) {
			throw AppError.conflict('Time slot conflicts with a lesson');
		}

		const eventConflict = await tx.instructorEvent.findFirst({
			where: {
				instructorId,
				isActive: true,
				startTime: { lt: end },
				endTime: { gt: start },
			},
			select: { id: true },
		});
		if (eventConflict) {
			throw AppError.conflict(
				'Time slot conflicts with a scheduled block',
			);
		}

		const vehicleId = await resolveVehicleId(tx);

		return tx.lesson.create({
			data: {
				courseId: course.id,
				studentId: studentProfileId,
				instructorId,
				vehicleId,
				lessonType: LessonType.PRACTICE,
				startTime: start,
				endTime: end,
			},
			select: {
				id: true,
				courseId: true,
				studentId: true,
				instructorId: true,
				vehicleId: true,
				lessonType: true,
				startTime: true,
				endTime: true,
				status: true,
				createdAt: true,
			},
		});
	});

	return { lesson: mapLessonRowToDto(row) };
}

export async function bookLesson(
	actor: { id: string; role: Role },
	body: BookLessonBody,
): Promise<{ lesson: LessonDto }> {
	const start = new Date(body.startTime);
	const end = new Date(body.endTime);
	const course = await loadCourseForBooking(body.courseId);

	await assertLessonTimeIsBookable(start, course.schoolId);
	await assertActorCanBookLessonForCourse(actor, course.schoolId);

	const studentProfileId = await loadStudentProfileIdForUser(body.studentId);

	await assertStudentParticipatesInCourse(course.id, studentProfileId);
	await assertInstructorCanBookCourse(body.instructorId, course);

	return createPracticeLessonForStudent({
		course,
		studentProfileId,
		instructorId: body.instructorId,
		start,
		end,
		resolveVehicleId: async (tx) => {
			await assertVehicleAvailableForBooking(
				tx,
				body.instructorId,
				body.vehicleId,
				course.schoolId,
				start,
				end,
			);
			return body.vehicleId;
		},
	});
}

export async function bookOwnLesson(
	actor: { id: string; role: Role },
	body: BookOwnLessonBody,
): Promise<{ lesson: LessonDto }> {
	if (actor.role !== Role.STUDENT) {
		throw AppError.forbidden('Forbidden');
	}

	const start = new Date(body.startTime);
	const end = new Date(body.endTime);
	const course = await loadCourseForBooking(body.courseId);

	assertCourseCanBeSelfBooked(course);
	await assertLessonTimeIsBookable(start, course.schoolId);

	const studentProfileId = await loadStudentProfileIdForUser(actor.id);

	await assertStudentParticipatesInCourse(course.id, studentProfileId, {
		requireActive: true,
	});
	await assertInstructorCanBookCourse(body.instructorId, course);

	return createPracticeLessonForStudent({
		course,
		studentProfileId,
		instructorId: body.instructorId,
		start,
		end,
		resolveVehicleId: (tx) =>
			findAvailableVehicleIdForStudentBooking(
				tx,
				body.instructorId,
				course.schoolId,
				start,
				end,
			),
	});
}

function mapLessonRowToDto(row: {
	id: string;
	courseId: string;
	studentId: string;
	instructorId: string;
	vehicleId: string | null;
	lessonType: LessonType;
	startTime: Date;
	endTime: Date;
	status: LessonStatus;
	createdAt: Date;
}): LessonDto {
	return {
		id: row.id,
		courseId: row.courseId,
		studentId: row.studentId,
		instructorId: row.instructorId,
		vehicleId: row.vehicleId,
		lessonType: row.lessonType,
		startTime: row.startTime.toISOString(),
		endTime: row.endTime.toISOString(),
		status: row.status,
		createdAt: row.createdAt.toISOString(),
	};
}

export async function cancelLesson(
	actor: { id: string; role: Role },
	lessonId: string,
): Promise<{ lesson: LessonDto }> {
	const existing = await prisma.lesson.findFirst({
		where: { id: lessonId, deletedAt: null },
		select: {
			id: true,
			status: true,
			courseId: true,
			studentId: true,
			instructorId: true,
			vehicleId: true,
			lessonType: true,
			startTime: true,
			endTime: true,
			createdAt: true,
			course: { select: { schoolId: true } },
		},
	});

	if (!existing) {
		throw AppError.notFound('Lesson not found');
	}

	await assertActorCanBookLessonForCourse(actor, existing.course.schoolId);

	if (existing.status === LessonStatus.COMPLETED) {
		throw AppError.badRequest('Cannot cancel a completed lesson');
	}
	if (existing.status === LessonStatus.CANCELLED) {
		throw AppError.badRequest('Lesson is already cancelled');
	}

	const row = await prisma.lesson.update({
		where: { id: lessonId },
		data: { status: LessonStatus.CANCELLED },
		select: {
			id: true,
			courseId: true,
			studentId: true,
			instructorId: true,
			vehicleId: true,
			lessonType: true,
			startTime: true,
			endTime: true,
			status: true,
			createdAt: true,
		},
	});

	return { lesson: mapLessonRowToDto(row) };
}

export async function cancelOwnLesson(
	actor: { id: string; role: Role },
	lessonId: string,
): Promise<{ lesson: LessonDto }> {
	if (actor.role !== Role.STUDENT) {
		throw AppError.forbidden('Forbidden');
	}

	const studentProfileId = await loadStudentProfileIdForUser(actor.id);
	const existing = await prisma.lesson.findFirst({
		where: { id: lessonId, deletedAt: null },
		select: {
			id: true,
			status: true,
			studentId: true,
			lessonType: true,
		},
	});

	if (!existing) {
		throw AppError.notFound('Lesson not found');
	}

	if (existing.studentId !== studentProfileId) {
		throw AppError.forbidden('Forbidden');
	}

	if (existing.lessonType !== LessonType.PRACTICE) {
		throw AppError.badRequest('Only practice lessons can be cancelled');
	}

	if (existing.status === LessonStatus.COMPLETED) {
		throw AppError.badRequest('Cannot cancel a completed lesson');
	}
	if (existing.status === LessonStatus.CANCELLED) {
		throw AppError.badRequest('Lesson is already cancelled');
	}
	if (existing.status !== LessonStatus.SCHEDULED) {
		throw AppError.badRequest('Only scheduled lessons can be cancelled');
	}

	const row = await prisma.lesson.update({
		where: { id: lessonId },
		data: { status: LessonStatus.CANCELLED },
		select: {
			id: true,
			courseId: true,
			studentId: true,
			instructorId: true,
			vehicleId: true,
			lessonType: true,
			startTime: true,
			endTime: true,
			status: true,
			createdAt: true,
		},
	});

	return { lesson: mapLessonRowToDto(row) };
}

export async function updateLesson(
	actor: { id: string; role: Role },
	lessonId: string,
	body: UpdateLessonBody,
): Promise<{ lesson: LessonDto }> {
	const existing = await prisma.lesson.findFirst({
		where: { id: lessonId, deletedAt: null },
		select: {
			id: true,
			status: true,
			courseId: true,
			studentId: true,
			instructorId: true,
			vehicleId: true,
			lessonType: true,
			startTime: true,
			endTime: true,
			createdAt: true,
			course: {
				select: {
					id: true,
					schoolId: true,
					instructorId: true,
					courseTypeId: true,
					kind: true,
					totalHours: true,
				},
			},
		},
	});

	if (!existing) {
		throw AppError.notFound('Lesson not found');
	}

	await assertActorCanBookLessonForCourse(actor, existing.course.schoolId);

	if (existing.status !== LessonStatus.SCHEDULED) {
		throw AppError.badRequest('Only scheduled lessons can be edited');
	}

	const start =
		body.startTime !== undefined
			? new Date(body.startTime)
			: existing.startTime;
	const end =
		body.endTime !== undefined ? new Date(body.endTime) : existing.endTime;
	const instructorId = body.instructorId ?? existing.instructorId;
	const vehicleId = body.vehicleId ?? existing.vehicleId;

	if (!vehicleId) {
		throw AppError.badRequest('Lesson has no vehicle');
	}

	const timeChanged =
		body.startTime !== undefined || body.endTime !== undefined;
	const instructorChanged =
		body.instructorId !== undefined &&
		body.instructorId !== existing.instructorId;

	const needsInstructorTimeValidation = timeChanged || instructorChanged;

	if (
		instructorId === existing.instructorId &&
		vehicleId === existing.vehicleId &&
		start.getTime() === existing.startTime.getTime() &&
		end.getTime() === existing.endTime.getTime()
	) {
		return {
			lesson: mapLessonRowToDto({
				id: existing.id,
				courseId: existing.courseId,
				studentId: existing.studentId,
				instructorId: existing.instructorId,
				vehicleId: existing.vehicleId,
				lessonType: existing.lessonType,
				startTime: existing.startTime,
				endTime: existing.endTime,
				status: existing.status,
				createdAt: existing.createdAt,
			}),
		};
	}

	const course = existing.course;

	const instructorLink = await prisma.instructorSchool.findFirst({
		where: {
			instructorId,
			schoolId: course.schoolId,
		},
		select: { id: true },
	});

	if (!instructorLink) {
		throw AppError.badRequest(
			'instructor does not belong to this driving school',
		);
	}

	if (course.instructorId != null && course.instructorId !== instructorId) {
		throw AppError.badRequest(
			'instructor does not match course assigned instructor',
		);
	}

	if (instructorChanged) {
		await assertInstructorQualifiedForCourseType(
			instructorId,
			course.courseTypeId,
		);
	}

	if (timeChanged) {
		if (start.getTime() < Date.now()) {
			throw AppError.badRequest('Lesson time must be in the future');
		}

		const settings = await prisma.schoolSettings.findUnique({
			where: { schoolId: course.schoolId },
			select: { bookingMaxDaysAhead: true },
		});
		const bookingMaxDaysAhead = settings?.bookingMaxDaysAhead ?? 30;
		const lessonDay = formatYYYYMMDD(start);
		const today = utcTodayYyyymmdd();
		const maxBookable = addDaysYyyymmdd(today, bookingMaxDaysAhead);
		if (compareYyyymmdd(lessonDay, today) < 0) {
			throw AppError.badRequest('Lesson date cannot be in the past');
		}
		if (compareYyyymmdd(lessonDay, maxBookable) > 0) {
			throw AppError.badRequest('Lesson date is outside booking window');
		}
	}

	const row = await prisma.$transaction(async (tx) => {
		if (needsInstructorTimeValidation) {
			await assertInstructorTimeWindowAvailable(
				instructorId,
				start,
				end,
				tx,
				undefined,
				lessonId,
			);

			await assertStudentNoScheduleOverlap(
				tx,
				existing.studentId,
				start,
				end,
				{
					excludeLessonId: lessonId,
				},
			);

			await assertCourseDrivingPackageHoursAllowNewLesson(
				tx,
				course.id,
				existing.studentId,
				course.kind,
				course.totalHours,
				start,
				end,
				lessonId,
			);

			const lessonConflict = await tx.lesson.findFirst({
				where: {
					instructorId,
					status: { not: LessonStatus.CANCELLED },
					startTime: { lt: end },
					endTime: { gt: start },
					id: { not: lessonId },
				},
				select: { id: true },
			});
			if (lessonConflict) {
				throw AppError.conflict('Time slot conflicts with a lesson');
			}

			const eventConflict = await tx.instructorEvent.findFirst({
				where: {
					instructorId,
					isActive: true,
					startTime: { lt: end },
					endTime: { gt: start },
				},
				select: { id: true },
			});
			if (eventConflict) {
				throw AppError.conflict(
					'Time slot conflicts with a scheduled block',
				);
			}
		}

		const vehicleInSchool = await tx.vehicle.findFirst({
			where: {
				id: vehicleId,
				schoolId: course.schoolId,
				isActive: true,
			},
			select: { id: true },
		});
		if (!vehicleInSchool) {
			throw AppError.badRequest('Vehicle is not for this driving school');
		}
		await validateVehicleForInstructor(instructorId, vehicleId, tx);

		const vehicleLessonConflict = await tx.lesson.findFirst({
			where: {
				vehicleId,
				status: { not: LessonStatus.CANCELLED },
				startTime: { lt: end },
				endTime: { gt: start },
				id: { not: lessonId },
			},
			select: { id: true },
		});
		if (vehicleLessonConflict) {
			throw AppError.conflict('Vehicle is already in use');
		}

		const vehicleEventConflict = await tx.instructorEvent.findFirst({
			where: {
				vehicleId,
				type: EventType.DRIVE,
				isActive: true,
				startTime: { lt: end },
				endTime: { gt: start },
			},
			select: { id: true },
		});
		if (vehicleEventConflict) {
			throw AppError.conflict('Vehicle is already in use');
		}

		return tx.lesson.update({
			where: { id: lessonId },
			data: {
				instructorId,
				vehicleId,
				startTime: start,
				endTime: end,
			},
			select: {
				id: true,
				courseId: true,
				studentId: true,
				instructorId: true,
				vehicleId: true,
				lessonType: true,
				startTime: true,
				endTime: true,
				status: true,
				createdAt: true,
			},
		});
	});

	return { lesson: mapLessonRowToDto(row) };
}

export function mapPersonToLessonDetailDto(profile: {
	id: string;
	userId: string;
	user: {
		firstName: string;
		lastName: string;
		email: string;
		phone: string | null;
	};
}): LessonPersonDetailDto {
	return {
		id: profile.id,
		userId: profile.userId,
		firstName: profile.user.firstName,
		lastName: profile.user.lastName,
		email: profile.user.email,
		phone: profile.user.phone,
	};
}

export function mapVehicleToLessonDetailDto(vehicle: {
	id: string;
	schoolId: string;
	name: string;
	registrationNumber: string;
	inspectionDate: Date | null;
	insuranceDate: Date | null;
	brand: string | null;
	model: string | null;
	photoUrl: string | null;
	modelYear: number | null;
	mileageKm: number | null;
	note: string | null;
	isActive: boolean;
	createdAt: Date;
}): LessonVehicleDetailDto {
	return {
		id: vehicle.id,
		schoolId: vehicle.schoolId,
		name: vehicle.name,
		registrationNumber: vehicle.registrationNumber,
		inspectionDate: vehicle.inspectionDate?.toISOString() ?? null,
		insuranceDate: vehicle.insuranceDate?.toISOString() ?? null,
		brand: vehicle.brand,
		model: vehicle.model,
		photoUrl: vehicle.photoUrl,
		modelYear: vehicle.modelYear,
		mileageKm: vehicle.mileageKm,
		note: vehicle.note,
		isActive: vehicle.isActive,
		createdAt: vehicle.createdAt.toISOString(),
	};
}

export async function getLessonById(
	actor: { id: string; role: Role },
	lessonId: string,
): Promise<{ lesson: LessonWithDetailsDto }> {
	const existing = await prisma.lesson.findFirst({
		where: { id: lessonId, deletedAt: null },
		select: {
			id: true,
			courseId: true,
			studentId: true,
			instructorId: true,
			vehicleId: true,
			lessonType: true,
			startTime: true,
			endTime: true,
			status: true,
			createdAt: true,
			course: { select: { schoolId: true } },
			vehicle: {
				select: {
					id: true,
					schoolId: true,
					name: true,
					registrationNumber: true,
					inspectionDate: true,
					insuranceDate: true,
					brand: true,
					model: true,
					photoUrl: true,
					modelYear: true,
					mileageKm: true,
					note: true,
					isActive: true,
					createdAt: true,
				},
			},
			instructorProfile: {
				select: {
					id: true,
					userId: true,
					user: {
						select: {
							firstName: true,
							lastName: true,
							email: true,
							phone: true,
						},
					},
				},
			},
			studentProfile: {
				select: {
					id: true,
					userId: true,
					user: {
						select: {
							firstName: true,
							lastName: true,
							email: true,
							phone: true,
						},
					},
				},
			},
		},
	});

	if (!existing) {
		throw AppError.notFound('Lesson not found');
	}

	await assertActorCanBookLessonForCourse(actor, existing.course.schoolId);

	const base = mapLessonRowToDto(existing);
	return {
		lesson: {
			id: base.id,
			courseId: base.courseId,
			lessonType: base.lessonType,
			startTime: base.startTime,
			endTime: base.endTime,
			status: base.status,
			createdAt: base.createdAt,
			instructor: mapPersonToLessonDetailDto(existing.instructorProfile),
			student: mapPersonToLessonDetailDto(existing.studentProfile),
			vehicle: existing.vehicle
				? mapVehicleToLessonDetailDto(existing.vehicle)
				: null,
		},
	};
}
