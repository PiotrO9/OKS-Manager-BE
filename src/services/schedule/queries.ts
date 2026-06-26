import { Role } from '@prisma/client';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import type {
	ScheduleManagerQuery,
	ScheduleMeQuery,
} from '../../schemas/schedule.schemas';
import { assertActorCanReadSchoolSchedule } from './access';
import { buildDateRangeWhere } from './dateRange';
import { eventInclude, lessonInclude } from './includes';
import {
	mapInstructorEvent,
	mapLesson,
	mergeScheduleItems,
} from './mappers';
import type { EventRow, LessonRow, ScheduleActor, ScheduleItemDto } from './types';

const prisma = getPrisma();

export async function getMySchedule(
	actor: ScheduleActor,
	query: ScheduleMeQuery,
): Promise<{ items: ScheduleItemDto[] }> {
	if (actor.role === Role.MANAGER || actor.role === Role.ADMIN) {
		throw AppError.forbidden('Forbidden');
	}

	const where = buildDateRangeWhere(query.dateFrom, query.dateTo, true);

	if (actor.role === Role.INSTRUCTOR) {
		const profile = await prisma.instructorProfile.findUnique({
			where: { userId: actor.id },
			select: { id: true },
		});
		if (!profile) {
			throw AppError.notFound('Instructor profile not found');
		}
		const eventWhere = buildDateRangeWhere(
			query.dateFrom,
			query.dateTo,
			false,
		);
		const [rows, eventRows] = await Promise.all([
			prisma.lesson.findMany({
				where: { ...where, instructorId: profile.id },
				include: lessonInclude,
				orderBy: { startTime: 'asc' },
			}),
			prisma.instructorEvent.findMany({
				where: {
					...eventWhere,
					instructorId: profile.id,
					isActive: true,
				},
				include: eventInclude,
				orderBy: { startTime: 'asc' },
			}),
		]);
		const lessonItems = rows.map((r) =>
			mapLesson(r as LessonRow, {
				includeInstructor: false,
				includeStudent: true,
			}),
		);
		const eventItems = eventRows.map((r) =>
			mapInstructorEvent(r as EventRow, {
				includeInstructor: false,
				includeStudents: true,
			}),
		);
		return { items: mergeScheduleItems(lessonItems, eventItems) };
	}

	if (actor.role === Role.STUDENT) {
		const profile = await prisma.studentProfile.findUnique({
			where: { userId: actor.id },
			select: { id: true },
		});
		if (!profile) {
			throw AppError.notFound('Student profile not found');
		}
		const eventWhere = buildDateRangeWhere(
			query.dateFrom,
			query.dateTo,
			false,
		);
		const [rows, eventRows] = await Promise.all([
			prisma.lesson.findMany({
				where: { ...where, studentId: profile.id },
				include: lessonInclude,
				orderBy: { startTime: 'asc' },
			}),
			prisma.instructorEvent.findMany({
				where: {
					...eventWhere,
					isActive: true,
					participants: { some: { studentId: profile.id } },
				},
				include: eventInclude,
				orderBy: { startTime: 'asc' },
			}),
		]);
		const lessonItems = rows.map((r) =>
			mapLesson(r as LessonRow, {
				includeInstructor: true,
				includeStudent: false,
				includeRating: true,
			}),
		);
		const eventItems = eventRows.map((r) =>
			mapInstructorEvent(r as EventRow, {
				includeInstructor: true,
				includeStudents: false,
			}),
		);
		return { items: mergeScheduleItems(lessonItems, eventItems) };
	}

	throw AppError.forbidden('Forbidden');
}

export async function getScheduleForTarget(
	actor: ScheduleActor,
	query: ScheduleManagerQuery,
): Promise<{ items: ScheduleItemDto[] }> {
	if (actor.role !== Role.MANAGER && actor.role !== Role.ADMIN) {
		throw AppError.forbidden('Forbidden');
	}

	const where = buildDateRangeWhere(query.dateFrom, query.dateTo, true);

	const eventWhere = buildDateRangeWhere(query.dateFrom, query.dateTo, false);

	if (query.instructorId) {
		const [rows, eventRows] = await Promise.all([
			prisma.lesson.findMany({
				where: { ...where, instructorId: query.instructorId },
				include: lessonInclude,
				orderBy: { startTime: 'asc' },
			}),
			prisma.instructorEvent.findMany({
				where: {
					...eventWhere,
					instructorId: query.instructorId,
					isActive: true,
				},
				include: eventInclude,
				orderBy: { startTime: 'asc' },
			}),
		]);
		const lessonItems = rows.map((r) =>
			mapLesson(r as LessonRow, {
				includeInstructor: false,
				includeStudent: true,
			}),
		);
		const eventItems = eventRows.map((r) =>
			mapInstructorEvent(r as EventRow, {
				includeInstructor: false,
				includeStudents: true,
			}),
		);
		return { items: mergeScheduleItems(lessonItems, eventItems) };
	}

	const schoolId = query.schoolId!;
	await assertActorCanReadSchoolSchedule(actor, schoolId);

	const [rows, eventRows] = await Promise.all([
		prisma.lesson.findMany({
			where: {
				...where,
				studentId: query.studentId!,
				course: { schoolId, deletedAt: null },
			},
			include: lessonInclude,
			orderBy: { startTime: 'asc' },
		}),
		prisma.instructorEvent.findMany({
			where: {
				...eventWhere,
				isActive: true,
				participants: { some: { studentId: query.studentId! } },
				course: { is: { schoolId, deletedAt: null } },
			},
			include: eventInclude,
			orderBy: { startTime: 'asc' },
		}),
	]);
	const lessonItems = rows.map((r) =>
		mapLesson(r as LessonRow, {
			includeInstructor: true,
			includeStudent: false,
		}),
	);
	const eventItems = eventRows.map((r) =>
		mapInstructorEvent(r as EventRow, {
			includeInstructor: true,
			includeStudents: false,
		}),
	);
	return { items: mergeScheduleItems(lessonItems, eventItems) };
}
