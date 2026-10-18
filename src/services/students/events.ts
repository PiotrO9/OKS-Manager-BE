import { EventType, LessonType, Role } from '@prisma/client';
import { buildInstructorEventOverlapWhere } from '../../lib/instructor-event-date-filter';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import type { StudentEventsQuery } from '../../lib/validation/uuid';
import type { StudentInstructorEventListItemDto } from '../event.service';
import {
	mapPersonToLessonDetailDto,
	mapVehicleToLessonDetailDto,
} from '../lesson.service';
import { resolveActiveStudentSchoolId } from './schoolResolver';
import { assertActorCanListStudentsForSchool } from './access';

const prisma = getPrisma();

export async function listStudentInstructorEvents(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	query: StudentEventsQuery,
): Promise<{ events: StudentInstructorEventListItemDto[] }> {
	if (actorRole === Role.STUDENT && actorId !== studentUserId) {
		throw AppError.forbidden('Forbidden');
	}

	const schoolId = await resolveActiveStudentSchoolId(studentUserId);
	if (query.schoolId !== undefined && query.schoolId !== schoolId)
		throw AppError.notFound('Student not found');

	if (actorRole !== Role.STUDENT) {
		await assertActorCanListStudentsForSchool(actorId, actorRole, schoolId);
	}

	const student = await prisma.studentProfile.findFirst({
		where: {
			userId: studentUserId,
			user: { deletedAt: null },
			studentSchools: {
				some: { schoolId, school: { deletedAt: null } },
			},
		},
		select: { id: true },
	});

	if (!student) {
		throw AppError.notFound('Student not found');
	}

	const dateWhere =
		query.dateFrom && query.dateTo
			? buildInstructorEventOverlapWhere(query.dateFrom, query.dateTo)
			: {};

	const rows = await prisma.instructorEvent.findMany({
		where: {
			isActive: true,
			schoolId,
			participants: { some: { studentId: student.id } },
			...dateWhere,
		},
		select: {
			id: true,
			schoolId: true,
			type: true,
			status: true,
			courseId: true,
			startTime: true,
			endTime: true,
			capacity: true,
			createdAt: true,
			instructor: {
				select: {
					id: true,
					userId: true,
					user: {
						select: {
							firstName: true,
							lastName: true,
							email: true,
							phone: true,
							profile: { select: { avatarUrl: true } },
						},
					},
				},
			},
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
			course: {
				select: { id: true, name: true },
			},
			_count: { select: { participants: true } },
		},
		orderBy: { startTime: 'asc' },
	});

	return {
		events: rows.map((row) => ({
			id: row.id,
			schoolId: row.schoolId,
			type: row.type,
			status: row.status,
			courseId: row.courseId,
			startTime: row.startTime.toISOString(),
			endTime: row.endTime.toISOString(),
			capacity: row.capacity,
			createdAt: row.createdAt.toISOString(),
			instructor: mapPersonToLessonDetailDto(row.instructor),
			vehicle: row.vehicle
				? mapVehicleToLessonDetailDto(row.vehicle)
				: null,
			participantCount: row._count.participants,
			calendarLessonType:
				row.type === EventType.THEORY
					? LessonType.THEORY
					: LessonType.PRACTICE,
			course: row.course,
		})),
	};
}
