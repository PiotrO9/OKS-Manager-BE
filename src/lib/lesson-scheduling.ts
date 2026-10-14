import {
	CourseKind,
	EventStatus,
	LessonStatus,
	LessonType,
	Prisma,
	PrismaClient,
} from '@prisma/client';
import { AppError } from './http/AppError';
import { ScheduleDomainError } from './http/ScheduleDomainError';

type Tx = Prisma.TransactionClient;

export async function getCoursePracticePackageBalance(
	db: Tx | PrismaClient,
	courseId: string,
	studentProfileId: string,
	totalHours: number,
	excludeLessonId?: string,
): Promise<{ bookedMinutes: number; remainingMinutes: number }> {
	const rows = await db.lesson.findMany({
		where: {
			courseId,
			studentId: studentProfileId,
			lessonType: LessonType.PRACTICE,
			deletedAt: null,
			status: { not: LessonStatus.CANCELLED },
			...(excludeLessonId ? { id: { not: excludeLessonId } } : {}),
		},
		select: { startTime: true, endTime: true },
	});
	const bookedMinutes = rows.reduce(
		(total, row) =>
			total +
			Math.round(
				(row.endTime.getTime() - row.startTime.getTime()) / 60_000,
			),
		0,
	);
	return {
		bookedMinutes,
		remainingMinutes: Math.max(0, totalHours * 60 - bookedMinutes),
	};
}

/**
 * Suma minut jazd zakończonych (rozliczenie „wykorzystanych” godzin kursu).
 */
export async function sumCompletedDrivingLessonMinutes(
	tx: Tx,
	courseId: string,
	studentProfileId: string,
): Promise<number> {
	const rows = await tx.lesson.findMany({
		where: {
			courseId,
			studentId: studentProfileId,
			status: LessonStatus.COMPLETED,
		},
		select: { startTime: true, endTime: true },
	});
	let minutes = 0;
	for (const row of rows) {
		minutes += Math.round(
			(row.endTime.getTime() - row.startTime.getTime()) / 60_000,
		);
	}
	return minutes;
}

/**
 * Kursant nie może być w dwóch miejscach naraz: lekcja (nieanulowana) lub zapis na blok instruktora.
 */
export async function assertStudentNoScheduleOverlap(
	tx: Tx,
	studentProfileId: string,
	start: Date,
	end: Date,
	options?: { excludeLessonId?: string },
): Promise<void> {
	const lessonHit = await tx.lesson.findFirst({
		where: {
			studentId: studentProfileId,
			status: { not: LessonStatus.CANCELLED },
			startTime: { lt: end },
			endTime: { gt: start },
			...(options?.excludeLessonId
				? { id: { not: options.excludeLessonId } }
				: {}),
		},
		select: { id: true },
	});
	if (lessonHit) {
		throw ScheduleDomainError.conflictFor(
			'STUDENT_BUSY',
			'Student already has a driving lesson at this time',
		);
	}

	const eventHit = await tx.eventParticipant.findFirst({
		where: {
			studentId: studentProfileId,
			event: {
				isActive: true,
				status: { not: EventStatus.CANCELLED },
				startTime: { lt: end },
				endTime: { gt: start },
			},
		},
		select: { id: true },
	});
	if (eventHit) {
		throw ScheduleDomainError.conflictFor(
			'STUDENT_BUSY',
			'Student is already assigned to another instructor block at this time',
		);
	}
}

/**
 * Limit pakietu godzin (tylko PRACTICAL / EXTRA): suma jazd nieanulowanych + nowa nie może przekroczyć totalHours.
 */
export async function assertCourseDrivingPackageHoursAllowNewLesson(
	tx: Tx,
	courseId: string,
	studentProfileId: string,
	courseKind: CourseKind,
	totalHours: number,
	start: Date,
	end: Date,
	excludeLessonId?: string,
): Promise<void> {
	if (
		courseKind !== CourseKind.PRACTICAL &&
		courseKind !== CourseKind.EXTRA
	) {
		return;
	}
	const newMinutes = Math.round((end.getTime() - start.getTime()) / 60_000);
	if (newMinutes <= 0) {
		throw AppError.badRequest('Lesson duration must be positive');
	}

	const { remainingMinutes } = await getCoursePracticePackageBalance(
		tx,
		courseId,
		studentProfileId,
		totalHours,
		excludeLessonId,
	);
	if (newMinutes > remainingMinutes) {
		throw ScheduleDomainError.conflictFor(
			'COURSE_LIMIT_EXCEEDED',
			`Pozostało ${remainingMinutes} minut jazd w pakiecie kursu.`,
			{ remainingMinutes },
		);
	}
}
