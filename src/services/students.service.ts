import { Prisma, Role } from '@prisma/client';
import { AppError } from '../lib/http/AppError';
import { getPrisma } from '../lib/prisma';
import {
	assertActorCanAssignStudentToSchoolForAdminOrManager,
	attachStudentToSchoolReplaceInTx,
} from '../lib/studentSchoolRegistration';
import type { ListStudentsQuery } from '../lib/validation/uuid';

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

export type StudentCourseDto = {
	id: string;
	name: string;
	category: string;
	status: string;
};

export type StudentDetailDto = {
	id: string;
	userId: string;
	firstName: string;
	lastName: string;
	email: string;
	pkkNumber: string | null;
	courses: StudentCourseDto[];
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
		courses: student.courseParticipants.map((cp) => ({
			id: cp.course.id,
			name: cp.course.name,
			category: cp.course.category,
			status: cp.status,
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
