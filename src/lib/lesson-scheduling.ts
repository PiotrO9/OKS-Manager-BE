import { CourseKind, LessonStatus, Prisma } from '@prisma/client';
import { AppError } from './http/AppError';

type Tx = Prisma.TransactionClient;

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
		throw AppError.conflict(
			'Student already has a driving lesson at this time',
		);
	}

	const eventHit = await tx.eventParticipant.findFirst({
		where: {
			studentId: studentProfileId,
			event: {
				startTime: { lt: end },
				endTime: { gt: start },
			},
		},
		select: { id: true },
	});
	if (eventHit) {
		throw AppError.conflict(
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

	const rows = await tx.lesson.findMany({
		where: {
			courseId,
			studentId: studentProfileId,
			status: { not: LessonStatus.CANCELLED },
		},
		select: { startTime: true, endTime: true },
	});
	let usedMinutes = 0;
	for (const row of rows) {
		usedMinutes += Math.round(
			(row.endTime.getTime() - row.startTime.getTime()) / 60_000,
		);
	}

	const allowedMinutes = totalHours * 60;
	if (usedMinutes + newMinutes > allowedMinutes) {
		throw AppError.conflict(
			`Course driving hours would exceed the package limit (${totalHours}h)`,
		);
	}
}
