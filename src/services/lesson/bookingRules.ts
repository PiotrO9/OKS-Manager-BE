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

import {
	addDaysYyyymmdd,
	compareYyyymmdd,
	formatYYYYMMDD,
	utcTodayYyyymmdd,
} from './dateUtils';
import { mapLessonRowToDto, type LessonDto } from './dtoMappers';
import {
	assertVehicleAvailableForBooking,
	findAvailableVehicleIdForStudentBooking,
} from './vehicleAvailability';

type CourseForBooking = {
	id: string;
	schoolId: string;
	instructorId: string | null;
	courseTypeId: string;
	kind: CourseKind;
	totalHours: number;
};

type DbClient = Prisma.TransactionClient | typeof prisma;

export async function assertActorCanBookLessonForCourse(
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

export function assertLessonTimeIsBookable(
	start: Date,
	courseSchoolId: string,
): Promise<void> {
	if (start.getTime() < Date.now()) {
		throw AppError.badRequest('Lesson time must be in the future');
	}

	return assertLessonDateInsideBookingWindow(start, courseSchoolId);
}

export async function assertLessonDateInsideBookingWindow(
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

export function assertCourseCanBeSelfBooked(course: CourseForBooking): void {
	if (course.kind === CourseKind.THEORY_GROUP) {
		throw AppError.badRequest('Course does not allow practice lessons');
	}
}

export async function loadCourseForBooking(
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

export async function loadStudentProfileIdForUser(userId: string): Promise<string> {
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

export async function assertInstructorCanBookCourse(
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

export async function assertStudentParticipatesInCourse(
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
