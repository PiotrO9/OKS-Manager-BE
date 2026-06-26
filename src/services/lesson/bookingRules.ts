import {
	LessonType,
	Prisma,
	Role,
} from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import type {
	BookLessonBody,
	BookOwnLessonBody,
} from '../../schemas/lesson.schemas';
import {
	addDaysYyyymmdd,
	compareYyyymmdd,
	formatYYYYMMDD,
	utcTodayYyyymmdd,
} from './dateUtils';
import { mapLessonRowToDto, type LessonDto } from './dtoMappers';
import {
	assertActorCanBookLessonForCourse,
	assertCourseCanBeSelfBooked,
	assertInstructorCanBookCourse,
	assertStudentParticipatesInCourse,
	loadCourseForBooking,
	loadStudentProfileIdForUser,
	type CourseForBooking,
} from './bookingAccess';
import {
	assertVehicleAvailableForBooking,
	findAvailableVehicleIdForStudentBooking,
} from './vehicleAvailability';
import { assertLessonSchedulingWindowAvailable } from './scheduleConflicts';

const prisma = getPrisma();

export {
	assertActorCanBookLessonForCourse,
	assertCourseCanBeSelfBooked,
	assertInstructorCanBookCourse,
	assertStudentParticipatesInCourse,
	loadCourseForBooking,
	loadStudentProfileIdForUser,
};

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
		await assertLessonSchedulingWindowAvailable(tx, {
			instructorId,
			studentProfileId,
			courseId: course.id,
			courseKind: course.kind,
			totalHours: course.totalHours,
			start,
			end,
		});

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
