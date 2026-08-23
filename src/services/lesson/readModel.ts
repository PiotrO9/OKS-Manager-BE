import { Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';

const prisma = getPrisma();

import { assertActorCanBookLessonForCourse } from './bookingRules';
import {
	mapLessonRowToDto,
	mapPersonToLessonDetailDto,
	mapVehicleToLessonDetailDto,
	type LessonWithDetailsDto,
} from './dtoMappers';

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
