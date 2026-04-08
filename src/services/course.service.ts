import type { Course, CourseKind, DrivingSchool } from '@prisma/client';
import { AppError } from '../lib/http/AppError';
import { getPrisma } from '../lib/prisma';
import type { CreateCourseBody } from '../schemas/course.schemas';

const prisma = getPrisma();

async function getSchoolOwnedByUser(
	userId: string,
	schoolId: string,
): Promise<DrivingSchool | null> {
	const school = await prisma.drivingSchool.findUnique({
		where: { id: schoolId },
	});
	if (!school || school.deletedAt !== null || school.ownerId !== userId) {
		return null;
	}
	return school;
}

export type CreatedCourseDto = {
	id: string;
	name: string;
	category: string;
	kind: CourseKind;
	totalHours: number;
	capacity: number | null;
	theoryStartDate: Date | null;
	theoryEndDate: Date | null;
	schoolId: string;
	instructorId: string | null;
	status: string;
	createdAt: Date;
};

function toDto(row: Course): CreatedCourseDto {
	return {
		id: row.id,
		name: row.name,
		category: row.category,
		kind: row.kind,
		totalHours: row.totalHours,
		capacity: row.capacity,
		theoryStartDate: row.theoryStartDate,
		theoryEndDate: row.theoryEndDate,
		schoolId: row.schoolId,
		instructorId: row.instructorId,
		status: row.status,
		createdAt: row.createdAt,
	};
}

async function createCourseForUser(
	userId: string,
	body: CreateCourseBody,
): Promise<CreatedCourseDto> {
	const schoolRow = await getSchoolOwnedByUser(userId, body.schoolId);
	if (!schoolRow) {
		throw AppError.forbidden('Forbidden');
	}

	if (body.instructorId) {
		const link = await prisma.instructorSchool.findFirst({
			where: {
				instructorId: body.instructorId,
				schoolId: body.schoolId,
			},
		});
		if (!link) {
			throw AppError.badRequest(
				'instructor does not belong to this school',
			);
		}
	}

	const capacity =
		body.kind === 'THEORY_GROUP' ? (body.capacity ?? null) : null;

	const theoryDates =
		body.kind === 'THEORY_GROUP' &&
		body.theoryStartDate &&
		body.theoryEndDate
			? {
					theoryStartDate: body.theoryStartDate,
					theoryEndDate: body.theoryEndDate,
				}
			: { theoryStartDate: null, theoryEndDate: null };

	const created = await prisma.course.create({
		data: {
			schoolId: body.schoolId,
			name: body.name,
			category: body.category,
			kind: body.kind,
			totalHours: body.totalHours,
			capacity,
			...theoryDates,
			instructorId: body.instructorId ?? null,
		},
	});

	return toDto(created);
}

export type CourseListInstructorDto = {
	id: string;
	name: string;
};

export type CourseListItemDto = {
	id: string;
	name: string;
	category: string;
	type: CourseKind;
	totalHours: number;
	instructor: CourseListInstructorDto | null;
};

async function listCoursesForSchool(
	userId: string,
	schoolId: string,
): Promise<CourseListItemDto[]> {
	const schoolRow = await getSchoolOwnedByUser(userId, schoolId);
	if (!schoolRow) {
		throw AppError.forbidden('Forbidden');
	}

	const rows = await prisma.course.findMany({
		where: {
			schoolId: schoolRow.id,
			deletedAt: null,
		},
		orderBy: { createdAt: 'desc' },
		include: {
			instructor: {
				include: {
					user: {
						select: {
							id: true,
							firstName: true,
							lastName: true,
						},
					},
				},
			},
		},
	});

	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		category: row.category,
		type: row.kind,
		totalHours: row.totalHours,
		instructor: row.instructor
			? {
					id: row.instructor.user.id,
					name: `${row.instructor.user.firstName} ${row.instructor.user.lastName}`.trim(),
				}
			: null,
	}));
}

export const courseService = {
	createCourseForUser,
	listCoursesForSchool,
};
