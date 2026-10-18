import { LessonType, Prisma, Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { ScheduleDomainError } from '../../lib/http/ScheduleDomainError';
import { instantToPolishDateTime } from '../../lib/polishScheduleTime';
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
import {
	assertScheduleDurationAllowed,
	assertStudentSelfBookingDurationAllowed,
} from '../schedule-validation/policy';
import { runScheduleWriteTransaction } from '../schedule-validation/transaction';

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
		throw ScheduleDomainError.badRequestFor(
			'DATE_NOT_BOOKABLE',
			'Lesson time must be in the future',
		);
	}

	return assertLessonDateInsideBookingWindow(start, courseSchoolId);
}

export async function assertLessonDateInsideBookingWindow(
	start: Date,
	courseSchoolId: string,
): Promise<void> {
	const settings = await prisma.schoolSettings.findUnique({
		where: { schoolId: courseSchoolId },
		select: { bookingMaxDaysAhead: true, workingDaysMask: true },
	});
	const bookingMaxDaysAhead = settings?.bookingMaxDaysAhead ?? 30;
	const lessonDay = formatYYYYMMDD(start);
	const today = utcTodayYyyymmdd();
	const maxBookable = addDaysYyyymmdd(today, bookingMaxDaysAhead);
	if (compareYyyymmdd(lessonDay, today) < 0) {
		throw ScheduleDomainError.badRequestFor(
			'DATE_NOT_BOOKABLE',
			'Lesson date cannot be in the past',
		);
	}
	if (compareYyyymmdd(lessonDay, maxBookable) > 0) {
		throw ScheduleDomainError.badRequestFor(
			'DATE_NOT_BOOKABLE',
			'Lesson date is outside booking window',
		);
	}
	const workingDaysMask = settings?.workingDaysMask || 62;
	const weekday = instantToPolishDateTime(start).dayOfWeek;
	if ((workingDaysMask & (1 << weekday)) === 0) {
		throw ScheduleDomainError.badRequestFor(
			'SCHOOL_CLOSED',
			'Driving school is closed on this day',
		);
	}
}

async function createPracticeLessonForStudent(input: {
	course: CourseForBooking;
	studentProfileId: string;
	instructorId: string;
	start: Date;
	end: Date;
	bookingMode?: 'REMAINING_PACKAGE';
	resolveVehicleId: (
		tx: Prisma.TransactionClient,
		currentCourse: CourseForBooking,
	) => Promise<string>;
}): Promise<{ lesson: LessonDto }> {
	const {
		course: initialCourse,
		studentProfileId,
		instructorId,
		start,
		end,
		bookingMode,
		resolveVehicleId,
	} = input;

	const row = await runScheduleWriteTransaction(async (tx) => {
		const course = await loadCourseForBooking(initialCourse.id, tx);
		if (
			course.courseTypeId !== initialCourse.courseTypeId ||
			course.kind !== initialCourse.kind ||
			course.instructorId !== initialCourse.instructorId
		) {
			throw AppError.conflict(
				'Kurs zmienił się podczas rezerwacji. Odśwież dane i wybierz termin ponownie.',
			);
		}
		if (bookingMode) {
			await assertStudentSelfBookingDurationAllowed(tx, {
				schoolId: course.schoolId,
				courseId: course.id,
				studentProfileId,
				totalHours: course.totalHours,
				start,
				end,
				bookingMode,
			});
		} else {
			await assertScheduleDurationAllowed(tx, {
				schoolId: course.schoolId,
				kind: 'PRACTICE',
				start,
				end,
			});
		}
		await assertLessonSchedulingWindowAvailable(tx, {
			instructorId,
			studentProfileId,
			courseId: course.id,
			courseKind: course.kind,
			totalHours: course.totalHours,
			start,
			end,
		});

		const vehicleId = await resolveVehicleId(tx, course);

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

	await assertStudentParticipatesInCourse(course.id, studentProfileId, {
		requireActive: true,
	});
	await assertInstructorCanBookCourse(body.instructorId, course, {
		allowSubstitute: true,
	});

	return createPracticeLessonForStudent({
		course,
		studentProfileId,
		instructorId: body.instructorId,
		start,
		end,
		resolveVehicleId: async (tx, currentCourse) => {
			await assertVehicleAvailableForBooking(
				tx,
				body.instructorId,
				body.vehicleId,
				currentCourse.schoolId,
				start,
				end,
				currentCourse.courseTypeId,
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
		bookingMode: body.bookingMode,
		resolveVehicleId: (tx, currentCourse) =>
			findAvailableVehicleIdForStudentBooking(
				tx,
				body.instructorId,
				currentCourse.schoolId,
				start,
				end,
				currentCourse.courseTypeId,
			),
	});
}
