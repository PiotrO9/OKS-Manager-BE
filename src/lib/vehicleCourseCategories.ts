import {
	EventStatus,
	EventType,
	LessonStatus,
	type Prisma,
	type PrismaClient,
} from '@prisma/client';
import { AppError } from './http/AppError';
import { ScheduleDomainError } from './http/ScheduleDomainError';

type DbClient = Prisma.TransactionClient | PrismaClient;
export const supportedCourseTypesInclude = {
	supportedCourseTypes: {
		select: { id: true, code: true, name: true },
		orderBy: { code: 'asc' as const },
	},
};

export function vehicleCourseTypeWhere(
	courseTypeId: string,
): Prisma.VehicleWhereInput {
	return { supportedCourseTypes: { some: { id: courseTypeId } } };
}

export async function assertVehicleSupportsCourseType(
	db: DbClient,
	vehicleId: string,
	courseTypeId: string,
): Promise<void> {
	if (
		!courseTypeId ||
		!(await db.vehicle.findFirst({
			where: { id: vehicleId, ...vehicleCourseTypeWhere(courseTypeId) },
			select: { id: true },
		}))
	) {
		throw ScheduleDomainError.badRequestFor(
			'VEHICLE_COURSE_TYPE_MISMATCH',
			'Pojazd nie obsługuje kategorii tego kursu. Wybierz zgodny pojazd.',
		);
	}
}

export async function assertSupportedCourseTypeIdsExist(
	db: DbClient,
	ids: string[] | undefined,
): Promise<void> {
	if (ids === undefined) return;
	const count = await db.courseType.count({ where: { id: { in: ids } } });
	if (count !== ids.length)
		throw AppError.badRequest(
			'Nieznana kategoria pojazdu. Odśwież katalog kategorii.',
		);
}

export async function assertVehicleCategoriesCanChange(
	db: DbClient,
	vehicleId: string,
	ids: string[] | undefined,
): Promise<void> {
	if (ids === undefined) return;
	await assertSupportedCourseTypeIdsExist(db, ids);
	const current = await db.vehicle.findUnique({
		where: { id: vehicleId },
		select: { supportedCourseTypes: { select: { id: true } } },
	});
	if (!current) throw AppError.notFound('Vehicle not found');
	const removed = current.supportedCourseTypes
		.filter((type) => !ids.includes(type.id))
		.map((type) => type.id);
	if (!removed.length) return;
	const now = new Date();
	const [lesson, event] = await Promise.all([
		db.lesson.findFirst({
			where: {
				vehicleId,
				deletedAt: null,
				status: LessonStatus.SCHEDULED,
				endTime: { gt: now },
				course: { courseTypeId: { in: removed } },
			},
			select: { id: true },
		}),
		db.instructorEvent.findFirst({
			where: {
				vehicleId,
				isActive: true,
				type: EventType.DRIVE,
				status: EventStatus.PLANNED,
				endTime: { gt: now },
				course: { courseTypeId: { in: removed } },
			},
			select: { id: true },
		}),
	]);
	if (lesson || event)
		throw AppError.conflict(
			'Nie można usunąć kategorii pojazdu używanej przez trwające lub zaplanowane jazdy. Najpierw zmień pojazd w tych zajęciach.',
		);
}

export async function assertVehicleSupportsCourse(
	db: DbClient,
	vehicleId: string,
	courseId: string,
): Promise<void> {
	const course = await db.course.findUnique({
		where: { id: courseId },
		select: { courseTypeId: true },
	});
	if (!course) throw AppError.notFound('Course not found');
	await assertVehicleSupportsCourseType(db, vehicleId, course.courseTypeId);
}
