import {
	CourseParticipantStatus,
	EventType,
	LessonStatus,
	LessonType,
	Prisma,
	Role,
} from '@prisma/client';
import { buildInstructorEventOverlapWhere } from '../lib/instructor-event-date-filter';
import { AppError } from '../lib/http/AppError';
import { getPrisma } from '../lib/prisma';
import {
	assertActorCanAssignStudentToSchoolForAdminOrManager,
	attachStudentToSchoolReplaceInTx,
} from '../lib/studentSchoolRegistration';
import type {
	ListStudentsQuery,
	StudentEventsQuery,
} from '../lib/validation/uuid';
import type { StudentInstructorEventListItemDto } from './event.service';
import {
	mapPersonToLessonDetailDto,
	mapVehicleToLessonDetailDto,
} from './lesson.service';

const prisma = getPrisma();

export type AssignStudentDrivingSchoolResult = {
	userId: string;
	drivingSchool: {
		id: string;
		name: string;
		city: string | null;
		address: string | null;
	};
};

export async function assignStudentDrivingSchoolForAdminOrManager(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	schoolId: string,
): Promise<AssignStudentDrivingSchoolResult> {
	if (actorRole !== Role.ADMIN && actorRole !== Role.MANAGER) {
		throw AppError.forbidden('Forbidden');
	}

	const studentUser = await prisma.user.findUnique({
		where: { id: studentUserId },
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
		throw AppError.badRequest('User is not a student');
	}

	await assertActorCanAssignStudentToSchoolForAdminOrManager(
		prisma,
		actorRole,
		actorId,
		schoolId,
	);

	await prisma.$transaction(async (tx) => {
		await attachStudentToSchoolReplaceInTx(tx, studentUserId, schoolId);
	});

	const drivingSchool = await prisma.drivingSchool.findUnique({
		where: { id: schoolId },
		select: {
			id: true,
			name: true,
			city: true,
			address: true,
		},
	});
	if (!drivingSchool) {
		throw AppError.notFound('Driving school not found');
	}

	return {
		userId: studentUserId,
		drivingSchool,
	};
}

async function assertActorCanPatchStudentPkk(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
): Promise<void> {
	if (actorRole === Role.ADMIN) {
		return;
	}
	if (actorRole !== Role.MANAGER && actorRole !== Role.INSTRUCTOR) {
		throw AppError.forbidden('Forbidden');
	}

	const studentSchools = await prisma.studentSchool.findMany({
		where: {
			student: { userId: studentUserId },
			school: { deletedAt: null },
		},
		select: { schoolId: true },
	});
	const schoolIds = studentSchools.map((row) => row.schoolId);
	if (schoolIds.length === 0) {
		throw AppError.forbidden('Forbidden');
	}

	if (actorRole === Role.MANAGER) {
		const ok = await prisma.studentSchool.findFirst({
			where: {
				student: { userId: studentUserId },
				school: { ownerId: actorId, deletedAt: null },
			},
		});
		if (!ok) {
			throw AppError.forbidden('Forbidden');
		}
		return;
	}

	const ok = await prisma.instructorSchool.findFirst({
		where: {
			instructor: { userId: actorId },
			schoolId: { in: schoolIds },
			school: { deletedAt: null },
		},
	});
	if (!ok) {
		throw AppError.forbidden('Forbidden');
	}
}

export type PatchStudentPkkResult = {
	userId: string;
	pkkNumber: string | null;
};

export async function patchStudentPkkForStaff(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	pkkNumber: string | null,
): Promise<PatchStudentPkkResult> {
	const studentUser = await prisma.user.findUnique({
		where: { id: studentUserId },
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
		throw AppError.badRequest('User is not a student');
	}

	await assertActorCanPatchStudentPkk(actorId, actorRole, studentUserId);

	try {
		await prisma.studentProfile.update({
			where: { userId: studentUserId },
			data: { pkkNumber },
		});
	} catch (err) {
		if (
			err instanceof Prisma.PrismaClientKnownRequestError &&
			err.code === 'P2002'
		) {
			throw AppError.conflict('PKK number already in use');
		}
		throw err;
	}

	return { userId: studentUserId, pkkNumber };
}

export type PatchStudentResult = {
	userId: string;
	notes: string | null;
};

export async function patchStudentForStaff(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	data: { notes: string | null },
): Promise<PatchStudentResult> {
	const studentUser = await prisma.user.findUnique({
		where: { id: studentUserId },
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
		throw AppError.badRequest('User is not a student');
	}

	await assertActorCanPatchStudentPkk(actorId, actorRole, studentUserId);

	const updated = await prisma.studentProfile.update({
		where: { userId: studentUserId },
		data: { notes: data.notes },
		select: { notes: true },
	});

	return { userId: studentUserId, notes: updated.notes };
}

export async function patchCourseParticipantStatusForStaff(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	courseId: string,
	status: CourseParticipantStatus,
): Promise<PatchCourseParticipantStatusResult> {
	if (actorRole === Role.ADMIN) {
		throw AppError.forbidden('Forbidden');
	}

	const studentUser = await prisma.user.findUnique({
		where: { id: studentUserId },
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
		throw AppError.badRequest('User is not a student');
	}

	const studentProfileId = studentUser.studentProfile.id;

	const course = await prisma.course.findFirst({
		where: { id: courseId, deletedAt: null },
		select: { id: true, schoolId: true },
	});

	if (!course) {
		throw AppError.notFound('Course not found');
	}

	const studentInSchool = await prisma.studentSchool.findFirst({
		where: {
			student: { userId: studentUserId },
			schoolId: course.schoolId,
			school: { deletedAt: null },
		},
	});

	if (!studentInSchool) {
		throw AppError.forbidden('Forbidden');
	}

	if (actorRole === Role.MANAGER) {
		const ownsSchool = await prisma.drivingSchool.findFirst({
			where: { id: course.schoolId, ownerId: actorId, deletedAt: null },
		});
		if (!ownsSchool) {
			throw AppError.forbidden('Forbidden');
		}
	} else if (actorRole === Role.INSTRUCTOR) {
		const instructorInSchool = await prisma.instructorSchool.findFirst({
			where: {
				instructor: { userId: actorId },
				schoolId: course.schoolId,
				school: { deletedAt: null },
			},
		});
		if (!instructorInSchool) {
			throw AppError.forbidden('Forbidden');
		}
	} else {
		throw AppError.forbidden('Forbidden');
	}

	const existing = await prisma.courseParticipant.findFirst({
		where: { courseId, studentId: studentProfileId },
		select: { id: true },
	});

	if (!existing) {
		throw AppError.notFound('Student is not enrolled in this course');
	}

	return prisma.courseParticipant.update({
		where: {
			uq_course_participants_course_id_student_id: {
				courseId,
				studentId: studentProfileId,
			},
		},
		data: { status },
		select: {
			id: true,
			courseId: true,
			studentId: true,
			status: true,
		},
	});
}

export type StudentCourseDto = {
	id: string;
	name: string;
	category: string;
	status: CourseParticipantStatus;
};

export type PatchCourseParticipantStatusResult = {
	id: string;
	courseId: string;
	studentId: string;
	status: CourseParticipantStatus;
};

export type StudentDetailDto = {
	id: string;
	userId: string;
	firstName: string;
	lastName: string;
	email: string;
	pkkNumber: string | null;
	notes: string | null;
	courses: StudentCourseDto[];
};

export type StudentProcessStatusStepDto = {
	name: string;
	completed: boolean;
	description: string;
};

export type StudentProcessStatusDto = {
	steps: StudentProcessStatusStepDto[];
};

export type StudentListItemDto = {
	id: string;
	userId: string;
	firstName: string;
	lastName: string;
	email: string;
	phone: string | null;
	pkkNumber: string | null;
	isActive: boolean;
	createdAt: Date;
};

export type ListStudentsResult = {
	data: StudentListItemDto[];
	total: number;
	page: number;
	limit: number;
};

async function assertActorCanListStudentsForSchool(
	actorId: string,
	actorRole: Role,
	schoolId: string,
): Promise<void> {
	if (actorRole === Role.ADMIN) {
		return;
	}

	if (actorRole === Role.MANAGER) {
		const ownsSchool = await prisma.drivingSchool.findFirst({
			where: { id: schoolId, ownerId: actorId, deletedAt: null },
			select: { id: true },
		});
		if (!ownsSchool) {
			throw AppError.forbidden('Forbidden');
		}
		return;
	}

	if (actorRole === Role.INSTRUCTOR) {
		const instructorInSchool = await prisma.instructorSchool.findFirst({
			where: {
				instructor: { userId: actorId },
				schoolId,
				school: { deletedAt: null },
			},
			select: { id: true },
		});
		if (!instructorInSchool) {
			throw AppError.forbidden('Forbidden');
		}
		return;
	}

	throw AppError.forbidden('Forbidden');
}

function hasText(value: string | null | undefined): boolean {
	return typeof value === 'string' && value.trim().length > 0;
}

function buildStudentProcessStatusSteps(input: {
	hasBasicData: boolean;
	hasPkkNumber: boolean;
	hasCourseAssignment: boolean;
	hasScheduledLesson: boolean;
}): StudentProcessStatusStepDto[] {
	return [
		{
			name: 'Dane kursanta',
			completed: input.hasBasicData,
			description:
				'Uzupełnij podstawowe dane kursanta i upewnij się, że konto jest aktywne.',
		},
		{
			name: 'Numer PKK',
			completed: input.hasPkkNumber,
			description: 'Dodaj numer PKK kursanta.',
		},
		{
			name: 'Przypisanie do kursu',
			completed: input.hasCourseAssignment,
			description: 'Przypisz kursanta do kursu w tej OSK.',
		},
		{
			name: 'Zaplanowanie jazd',
			completed: input.hasScheduledLesson,
			description: 'Zaplanuj co najmniej jedną nieanulowaną jazdę.',
		},
	];
}

export async function getStudentProcessStatus(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	schoolId: string,
): Promise<StudentProcessStatusDto> {
	if (actorRole === Role.STUDENT && actorId !== studentUserId) {
		throw AppError.forbidden('Forbidden');
	}

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
		select: {
			id: true,
			pkkNumber: true,
			user: {
				select: {
					firstName: true,
					lastName: true,
					email: true,
					isActive: true,
				},
			},
			courseParticipants: {
				where: { course: { schoolId, deletedAt: null } },
				select: { id: true },
				take: 1,
			},
		},
	});

	if (!student) {
		throw AppError.notFound('Student not found');
	}

	const scheduledLesson = await prisma.lesson.findFirst({
		where: {
			studentId: student.id,
			deletedAt: null,
			status: { not: LessonStatus.CANCELLED },
			course: { schoolId, deletedAt: null },
		},
		select: { id: true },
	});

	return {
		steps: buildStudentProcessStatusSteps({
			hasBasicData:
				student.user.isActive &&
				hasText(student.user.firstName) &&
				hasText(student.user.lastName) &&
				hasText(student.user.email),
			hasPkkNumber: hasText(student.pkkNumber),
			hasCourseAssignment: student.courseParticipants.length > 0,
			hasScheduledLesson: scheduledLesson !== null,
		}),
	};
}

export async function getStudentDetail(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	schoolId: string,
): Promise<StudentDetailDto> {
	if (actorRole === Role.STUDENT && actorId !== studentUserId) {
		throw AppError.forbidden('Forbidden');
	}

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
		select: {
			id: true,
			pkkNumber: true,
			notes: true,
			user: {
				select: {
					id: true,
					firstName: true,
					lastName: true,
					email: true,
				},
			},
			courseParticipants: {
				where: {
					course: { schoolId, deletedAt: null },
				},
				select: {
					status: true,
					course: {
						select: {
							id: true,
							name: true,
							category: true,
						},
					},
				},
			},
		},
	});

	if (!student) {
		throw AppError.notFound('Student not found');
	}

	return {
		id: student.id,
		userId: student.user.id,
		firstName: student.user.firstName,
		lastName: student.user.lastName,
		email: student.user.email,
		pkkNumber: student.pkkNumber,
		notes: student.notes,
		courses: student.courseParticipants.map((cp) => ({
			id: cp.course.id,
			name: cp.course.name,
			category: cp.course.category,
			status: cp.status,
		})),
	};
}

/**
 * Gdy `schoolId` nie podano — używa jedynej aktywnej szkoły kursanta.
 * Przy wielu przypisaniach wymaga jawnego `schoolId`.
 */
async function resolveSchoolIdForStudentEvents(
	studentUserId: string,
	querySchoolId: string | undefined,
): Promise<string> {
	const links = await prisma.studentSchool.findMany({
		where: {
			student: { userId: studentUserId, user: { deletedAt: null } },
			school: { deletedAt: null },
		},
		select: { schoolId: true },
	});

	if (links.length === 0) {
		throw AppError.notFound('Student not found');
	}

	if (querySchoolId !== undefined) {
		const ok = links.some((l) => l.schoolId === querySchoolId);
		if (!ok) {
			throw AppError.notFound('Student not found');
		}
		return querySchoolId;
	}

	if (links.length > 1) {
		throw AppError.badRequest(
			'schoolId is required when the student is enrolled in multiple schools',
		);
	}

	return links[0].schoolId;
}

export async function listStudentInstructorEvents(
	actorId: string,
	actorRole: Role,
	studentUserId: string,
	query: StudentEventsQuery,
): Promise<{ events: StudentInstructorEventListItemDto[] }> {
	if (actorRole === Role.STUDENT && actorId !== studentUserId) {
		throw AppError.forbidden('Forbidden');
	}

	const schoolId = await resolveSchoolIdForStudentEvents(
		studentUserId,
		query.schoolId,
	);

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
			participants: { some: { studentId: student.id } },
			...dateWhere,
		},
		select: {
			id: true,
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

export async function listStudentsForSchool(
	actorId: string,
	actorRole: Role,
	query: ListStudentsQuery,
): Promise<ListStudentsResult> {
	const { schoolId, courseId, page, limit } = query;

	await assertActorCanListStudentsForSchool(actorId, actorRole, schoolId);

	if (courseId) {
		const course = await prisma.course.findFirst({
			where: { id: courseId, schoolId, deletedAt: null },
			select: { id: true },
		});
		if (!course) {
			throw AppError.notFound('Course not found');
		}
	}

	const where: Prisma.StudentProfileWhereInput = {
		user: { deletedAt: null },
		studentSchools: {
			some: { schoolId, school: { deletedAt: null } },
		},
		...(courseId ? { courseParticipants: { some: { courseId } } } : {}),
	};

	const [rows, total] = await prisma.$transaction([
		prisma.studentProfile.findMany({
			where,
			select: {
				id: true,
				pkkNumber: true,
				createdAt: true,
				user: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						email: true,
						phone: true,
						isActive: true,
					},
				},
			},
			orderBy: [
				{ user: { lastName: 'asc' } },
				{ user: { firstName: 'asc' } },
			],
			skip: (page - 1) * limit,
			take: limit,
		}),
		prisma.studentProfile.count({ where }),
	]);

	const data: StudentListItemDto[] = rows.map((row) => ({
		id: row.id,
		userId: row.user.id,
		firstName: row.user.firstName,
		lastName: row.user.lastName,
		email: row.user.email,
		phone: row.user.phone,
		pkkNumber: row.pkkNumber,
		isActive: row.user.isActive,
		createdAt: row.createdAt,
	}));

	return { data, total, page, limit };
}
