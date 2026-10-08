import { CourseParticipantStatus, Prisma, Role } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	assignStudentDrivingSchoolForAdminOrManager,
	patchStudentForStaff,
	patchStudentPkkForStaff,
} from '../../services/students/profileMutations';
import {
	assignStudentToCourseForStaff,
	patchCourseParticipantStatusForStaff,
} from '../../services/students/courseParticipants';

const { db } = vi.hoisted(() => ({
	db: {
		user: { findUnique: vi.fn() },
		studentProfile: { findUnique: vi.fn(), update: vi.fn() },
		studentSchool: {
			findMany: vi.fn(),
			findFirst: vi.fn(),
			deleteMany: vi.fn(),
			create: vi.fn(),
		},
		instructorSchool: { findFirst: vi.fn() },
		drivingSchool: { findUnique: vi.fn(), findFirst: vi.fn() },
		course: { findFirst: vi.fn() },
		courseParticipant: {
			findFirst: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
		},
		$transaction: vi.fn(),
		$queryRaw: vi.fn(),
		accountAction: { count: vi.fn() },
	},
}));

vi.mock('../../lib/prisma', () => ({ getPrisma: () => db }));

const actorId = 'actor-id';
const studentUserId = 'student-user-id';
const studentProfileId = 'student-profile-id';
const schoolId = 'school-id';
const courseId = 'course-id';
const participantId = 'participant-id';

const operations = [
	{
		name: 'notes',
		run: () =>
			patchStudentForStaff(actorId, Role.ADMIN, studentUserId, {
				notes: 'Note',
			}),
	},
	{
		name: 'PKK',
		run: () =>
			patchStudentPkkForStaff(actorId, Role.ADMIN, studentUserId, '123'),
	},
	{
		name: 'driving school',
		run: () =>
			assignStudentDrivingSchoolForAdminOrManager(
				actorId,
				Role.ADMIN,
				studentUserId,
				schoolId,
			),
	},
	{
		name: 'course assignment',
		run: () =>
			assignStudentToCourseForStaff(
				actorId,
				Role.MANAGER,
				studentUserId,
				courseId,
			),
	},
];

describe('active student validation across four mutations', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		db.user.findUnique.mockResolvedValue({
			id: studentUserId,
			role: Role.STUDENT,
			deletedAt: null,
			isActive: true,
			studentProfile: { id: studentProfileId },
		});
		db.studentProfile.update.mockResolvedValue({ notes: 'Note' });
		db.studentProfile.findUnique.mockResolvedValue({
			id: studentProfileId,
		});
		db.studentSchool.findMany.mockResolvedValue([{ schoolId }]);
		db.studentSchool.findFirst.mockResolvedValue({ id: 'school-link' });
		db.instructorSchool.findFirst.mockResolvedValue({
			id: 'instructor-link',
		});
		db.drivingSchool.findUnique.mockResolvedValue({
			id: schoolId,
			name: 'School',
			city: 'Warsaw',
			address: 'Street',
			ownerId: actorId,
			deletedAt: null,
		});
		db.drivingSchool.findFirst.mockResolvedValue({ id: schoolId });
		db.$queryRaw.mockResolvedValue([{ id: studentUserId }]);
		db.accountAction.count.mockResolvedValue(0);
		db.course.findFirst.mockResolvedValue({ id: courseId, schoolId });
		db.courseParticipant.findFirst.mockResolvedValue(null);
		db.courseParticipant.create.mockResolvedValue({
			id: participantId,
			courseId,
			studentId: studentProfileId,
		});
		db.courseParticipant.update.mockResolvedValue({
			id: participantId,
			courseId,
			studentId: studentProfileId,
			status: CourseParticipantStatus.FINISHED,
		});
		db.$transaction.mockImplementation(
			async (callback: (tx: typeof db) => Promise<unknown>) =>
				callback(db),
		);
	});

	it.each(operations)(
		'$name returns 404 before disabled and role errors for a deleted user',
		async ({ run }) => {
			db.user.findUnique.mockResolvedValue({
				role: Role.MANAGER,
				deletedAt: new Date(),
				isActive: false,
				studentProfile: null,
			});
			await expect(run()).rejects.toMatchObject({
				statusCode: 404,
				message: 'User not found',
			});
			expect(db.studentProfile.update).not.toHaveBeenCalled();
			expect(db.courseParticipant.create).not.toHaveBeenCalled();
		},
	);

	it.each(operations)(
		'$name returns 404 for a missing user',
		async ({ run }) => {
			db.user.findUnique.mockResolvedValue(null);
			await expect(run()).rejects.toMatchObject({
				statusCode: 404,
				message: 'User not found',
			});
		},
	);

	it.each(operations)(
		'$name returns 403 before role/profile errors for a disabled user',
		async ({ run }) => {
			db.user.findUnique.mockResolvedValue({
				role: Role.MANAGER,
				deletedAt: null,
				isActive: false,
				studentProfile: null,
			});
			await expect(run()).rejects.toMatchObject({
				statusCode: 403,
				message: 'Account is disabled',
			});
		},
	);

	it.each(operations)(
		'$name rejects a wrong role or missing student profile with 400',
		async ({ run }) => {
			for (const overrides of [
				{
					role: Role.MANAGER,
					studentProfile: { id: studentProfileId },
				},
				{ role: Role.STUDENT, studentProfile: null },
			]) {
				db.user.findUnique.mockResolvedValue({
					deletedAt: null,
					isActive: true,
					...overrides,
				});
				await expect(run()).rejects.toMatchObject({
					statusCode: 400,
					message: 'User is not a student',
				});
			}
		},
	);

	it('rejects forbidden actors before loading a student for school and course operations', async () => {
		await expect(
			assignStudentDrivingSchoolForAdminOrManager(
				actorId,
				Role.INSTRUCTOR,
				studentUserId,
				schoolId,
			),
		).rejects.toMatchObject({ statusCode: 403, message: 'Forbidden' });
		await expect(
			assignStudentToCourseForStaff(
				actorId,
				Role.ADMIN,
				studentUserId,
				courseId,
			),
		).rejects.toMatchObject({ statusCode: 403, message: 'Forbidden' });
		await expect(
			patchCourseParticipantStatusForStaff(
				actorId,
				Role.ADMIN,
				studentUserId,
				courseId,
				CourseParticipantStatus.FINISHED,
			),
		).rejects.toMatchObject({ statusCode: 403, message: 'Forbidden' });
		expect(db.user.findUnique).not.toHaveBeenCalled();
	});

	it('keeps userId in notes and PKK writes and responses', async () => {
		await expect(
			patchStudentForStaff(actorId, Role.ADMIN, studentUserId, {
				notes: 'Note',
			}),
		).resolves.toEqual({ userId: studentUserId, notes: 'Note' });
		await expect(
			patchStudentPkkForStaff(actorId, Role.ADMIN, studentUserId, '123'),
		).resolves.toEqual({ userId: studentUserId, pkkNumber: '123' });
		expect(db.studentProfile.update).toHaveBeenCalledWith({
			where: { userId: studentUserId },
			data: { notes: 'Note' },
			select: { notes: true },
		});
		expect(db.studentProfile.update).toHaveBeenCalledWith({
			where: { userId: studentUserId },
			data: { pkkNumber: '123' },
		});
	});

	it('preserves school access for manager and instructor on notes and PKK', async () => {
		await patchStudentForStaff(actorId, Role.MANAGER, studentUserId, {
			notes: 'Note',
		});
		await patchStudentPkkForStaff(
			actorId,
			Role.INSTRUCTOR,
			studentUserId,
			'123',
		);
		expect(db.studentSchool.findFirst).toHaveBeenCalledWith({
			where: {
				student: { userId: studentUserId },
				school: { ownerId: actorId, deletedAt: null },
			},
		});
		expect(db.instructorSchool.findFirst).toHaveBeenCalledWith({
			where: {
				instructor: { userId: actorId },
				schoolId: { in: [schoolId] },
				school: { deletedAt: null },
			},
		});
		db.instructorSchool.findFirst.mockResolvedValue(null);
		await expect(
			patchStudentPkkForStaff(
				actorId,
				Role.INSTRUCTOR,
				studentUserId,
				'123',
			),
		).rejects.toMatchObject({ statusCode: 403, message: 'Forbidden' });
	});

	it('keeps the PKK uniqueness conflict response', async () => {
		db.studentProfile.update.mockRejectedValue(
			new Prisma.PrismaClientKnownRequestError('Duplicate PKK', {
				code: 'P2002',
				clientVersion: '7.5.0',
			}),
		);
		await expect(
			patchStudentPkkForStaff(actorId, Role.ADMIN, studentUserId, '123'),
		).rejects.toMatchObject({
			statusCode: 409,
			message: 'PKK number already in use',
		});
	});

	it('keeps school assignment scoped to the student user and manager-owned school', async () => {
		await expect(
			assignStudentDrivingSchoolForAdminOrManager(
				actorId,
				Role.MANAGER,
				studentUserId,
				schoolId,
			),
		).resolves.toMatchObject({
			userId: studentUserId,
			drivingSchool: { id: schoolId },
		});
		expect(db.studentSchool.deleteMany).toHaveBeenCalledWith({
			where: { studentId: studentProfileId },
		});
		expect(db.studentSchool.create).toHaveBeenCalledWith({
			data: { studentId: studentProfileId, schoolId },
		});
		db.drivingSchool.findUnique.mockResolvedValue({
			id: schoolId,
			ownerId: 'other-manager',
			deletedAt: null,
		});
		await expect(
			assignStudentDrivingSchoolForAdminOrManager(
				actorId,
				Role.MANAGER,
				studentUserId,
				schoolId,
			),
		).rejects.toMatchObject({ statusCode: 403, message: 'Forbidden' });
	});

	it('allows ADMIN school assignment without requiring school ownership', async () => {
		db.drivingSchool.findUnique.mockResolvedValue({
			id: schoolId,
			ownerId: 'another-user',
			deletedAt: null,
		});
		await expect(
			assignStudentDrivingSchoolForAdminOrManager(
				actorId,
				Role.ADMIN,
				studentUserId,
				schoolId,
			),
		).resolves.toMatchObject({ userId: studentUserId });
	});

	it('rejects a manager transfer when the student currently belongs to another OSK', async () => {
		db.studentSchool.findFirst.mockResolvedValue(null);
		await expect(
			assignStudentDrivingSchoolForAdminOrManager(
				actorId,
				Role.MANAGER,
				studentUserId,
				schoolId,
			),
		).rejects.toMatchObject({ statusCode: 404 });
		expect(db.studentSchool.deleteMany).not.toHaveBeenCalled();
		expect(db.studentSchool.create).not.toHaveBeenCalled();
	});

	it('uses the profile ID for course assignment and status, with school access checked first', async () => {
		await assignStudentToCourseForStaff(
			actorId,
			Role.MANAGER,
			studentUserId,
			courseId,
		);
		expect(db.courseParticipant.findFirst).toHaveBeenCalledWith({
			where: { courseId, studentId: studentProfileId },
		});
		expect(db.courseParticipant.create).toHaveBeenCalledWith({
			data: { courseId, studentId: studentProfileId },
		});
		db.courseParticipant.findFirst.mockResolvedValue({ id: participantId });
		await patchCourseParticipantStatusForStaff(
			actorId,
			Role.INSTRUCTOR,
			studentUserId,
			courseId,
			CourseParticipantStatus.FINISHED,
		);
		expect(db.courseParticipant.update).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					uq_course_participants_course_id_student_id: {
						courseId,
						studentId: studentProfileId,
					},
				},
				data: { status: CourseParticipantStatus.FINISHED },
			}),
		);
		db.studentSchool.findFirst.mockResolvedValue(null);
		await expect(
			assignStudentToCourseForStaff(
				actorId,
				Role.MANAGER,
				studentUserId,
				courseId,
			),
		).rejects.toMatchObject({ statusCode: 403, message: 'Forbidden' });
	});

	it('allows closing a historical course participant after the account is blocked or transferred', async () => {
		db.user.findUnique.mockResolvedValue({
			id: studentUserId,
			role: Role.STUDENT,
			isActive: false,
			deletedAt: null,
			studentProfile: { id: studentProfileId },
		});
		db.studentSchool.findFirst.mockResolvedValue(null);
		db.courseParticipant.findFirst.mockResolvedValue({ id: participantId });
		await expect(
			patchCourseParticipantStatusForStaff(
				actorId,
				Role.MANAGER,
				studentUserId,
				courseId,
				CourseParticipantStatus.FINISHED,
			),
		).resolves.toMatchObject({ status: CourseParticipantStatus.FINISHED });
		expect(db.studentSchool.findFirst).not.toHaveBeenCalled();
	});

	it('keeps manager and instructor school checks on course operations', async () => {
		await assignStudentToCourseForStaff(
			actorId,
			Role.INSTRUCTOR,
			studentUserId,
			courseId,
		);
		expect(db.instructorSchool.findFirst).toHaveBeenCalledWith({
			where: {
				instructor: { userId: actorId },
				schoolId,
				school: { deletedAt: null },
			},
			select: { id: true },
		});
		db.drivingSchool.findFirst.mockResolvedValue(null);
		db.courseParticipant.findFirst.mockResolvedValue({ id: participantId });
		await expect(
			patchCourseParticipantStatusForStaff(
				actorId,
				Role.MANAGER,
				studentUserId,
				courseId,
				CourseParticipantStatus.FINISHED,
			),
		).rejects.toMatchObject({ statusCode: 403, message: 'Forbidden' });
		expect(db.courseParticipant.update).not.toHaveBeenCalled();
	});

	it('preserves course, enrollment and duplicate errors', async () => {
		db.course.findFirst.mockResolvedValue(null);
		await expect(
			assignStudentToCourseForStaff(
				actorId,
				Role.MANAGER,
				studentUserId,
				courseId,
			),
		).rejects.toMatchObject({
			statusCode: 404,
			message: 'Course not found',
		});
		db.course.findFirst.mockResolvedValue({ id: courseId, schoolId });
		await expect(
			patchCourseParticipantStatusForStaff(
				actorId,
				Role.MANAGER,
				studentUserId,
				courseId,
				CourseParticipantStatus.FINISHED,
			),
		).rejects.toMatchObject({
			statusCode: 404,
			message: 'Student is not enrolled in this course',
		});
		db.courseParticipant.findFirst.mockResolvedValue({ id: participantId });
		await expect(
			assignStudentToCourseForStaff(
				actorId,
				Role.MANAGER,
				studentUserId,
				courseId,
			),
		).rejects.toMatchObject({
			statusCode: 409,
			message: 'Student is already enrolled in this course',
		});
	});
});
