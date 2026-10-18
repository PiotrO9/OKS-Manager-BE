import {
	CourseKind,
	CourseParticipantStatus,
	Role,
	type Prisma,
} from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import { assertActorCanBookLessonForCourse } from './bookingAccess';

const prisma = getPrisma();

export interface BookingOptionsQuery {
	schoolId: string;
	instructorIds: string[];
	q: string;
	page: number;
	limit: number;
}

export async function getLessonBookingOptions(
	actor: { id: string; role: Role },
	query: BookingOptionsQuery,
) {
	await assertActorCanBookLessonForCourse(actor, query.schoolId);
	const instructors = await prisma.instructorProfile.findMany({
		where: {
			id: { in: query.instructorIds },
			instructorSchools: { some: { schoolId: query.schoolId } },
			user: { role: Role.INSTRUCTOR, isActive: true, deletedAt: null },
		},
		select: { id: true, qualifiedCourseTypes: { select: { id: true } } },
	});
	if (instructors.length !== new Set(query.instructorIds).size) {
		throw AppError.badRequest(
			'Instructor does not belong to this driving school',
		);
	}
	const qualifiedTypeIds = [
		...new Set(
			instructors.flatMap((row) =>
				row.qualifiedCourseTypes.map((type) => type.id),
			),
		),
	];
	if (!qualifiedTypeIds.length) {
		return {
			items: [],
			total: 0,
			page: query.page,
			limit: query.limit,
			totalPages: 0,
		};
	}

	const eligibleCourse: Prisma.CourseWhereInput = {
		schoolId: query.schoolId,
		deletedAt: null,
		status: 'active',
		kind: { in: [CourseKind.PRACTICAL, CourseKind.EXTRA] },
		courseTypeId: { in: qualifiedTypeIds },
	};
	const nameParts = query.q.trim().split(/\s+/);
	const fullNameFilters =
		nameParts.length > 1
			? [
					{
						AND: [
							{
								firstName: {
									contains: nameParts[0],
									mode: 'insensitive' as const,
								},
							},
							{
								lastName: {
									contains: nameParts.slice(1).join(' '),
									mode: 'insensitive' as const,
								},
							},
						],
					},
				]
			: [];
	const where: Prisma.StudentProfileWhereInput = {
		studentSchools: { some: { schoolId: query.schoolId } },
		user: {
			role: Role.STUDENT,
			isActive: true,
			deletedAt: null,
			...(query.q
				? {
						OR: [
							{
								firstName: {
									contains: query.q,
									mode: 'insensitive',
								},
							},
							{
								lastName: {
									contains: query.q,
									mode: 'insensitive',
								},
							},
							{
								email: {
									contains: query.q,
									mode: 'insensitive',
								},
							},
							...fullNameFilters,
						],
					}
				: {}),
		},
		courseParticipants: {
			some: {
				status: CourseParticipantStatus.ACTIVE,
				course: eligibleCourse,
			},
		},
	};
	const [total, students] = await prisma.$transaction([
		prisma.studentProfile.count({ where }),
		prisma.studentProfile.findMany({
			where,
			orderBy: [
				{ user: { lastName: 'asc' } },
				{ user: { firstName: 'asc' } },
				{ id: 'asc' },
			],
			skip: (query.page - 1) * query.limit,
			take: query.limit,
			select: {
				userId: true,
				user: {
					select: { firstName: true, lastName: true, email: true },
				},
				courseParticipants: {
					where: {
						status: CourseParticipantStatus.ACTIVE,
						course: eligibleCourse,
					},
					select: {
						course: {
							select: {
								id: true,
								name: true,
								category: true,
								courseTypeId: true,
								kind: true,
							},
						},
					},
				},
			},
		}),
	]);
	return {
		items: students.map((student) => ({
			userId: student.userId,
			firstName: student.user.firstName,
			lastName: student.user.lastName,
			email: student.user.email,
			courses: student.courseParticipants.map(({ course }) => ({
				...course,
				status: 'ACTIVE',
			})),
		})),
		total,
		page: query.page,
		limit: query.limit,
		totalPages: Math.ceil(total / query.limit),
	};
}
