import type { z } from 'zod';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import type {
	createDrivingSchoolBodySchema,
	updateDrivingSchoolBodySchema,
} from '../../schemas/driving-school.schemas';
import {
	activeSchoolClause,
	reconcileUserDefaultOskId,
} from '../oskContext';
import { loadOwnedActiveDrivingSchoolOrThrow } from './access';
import {
	mapSchoolWithOfferedSettings,
	settingsIncludeOffered,
} from './shared';
import {
	assertOfferedCourseTypesExist,
	buildDrivingSchoolScalarUpdate,
	hasDrivingSchoolSettingsUpdate,
	upsertDrivingSchoolSettings,
} from './settingsCommands';

const prisma = getPrisma();

type CreateDrivingSchoolInput = z.infer<typeof createDrivingSchoolBodySchema>;
type UpdateDrivingSchoolInput = z.infer<typeof updateDrivingSchoolBodySchema>;

export async function createDrivingSchoolForOwner(
	userId: string,
	data: CreateDrivingSchoolInput,
) {
	const { name, city, address } = data;

	const existingCount = await prisma.drivingSchool.count({
		where: activeSchoolClause({ ownerId: userId }),
	});

	const isFirstSchool = existingCount === 0;

	const newSchool = await prisma.$transaction(async (tx) => {
		const school = await tx.drivingSchool.create({
			data: {
				name,
				city,
				address,
				ownerId: userId,
			},
		});

		if (isFirstSchool) {
			await tx.user.update({
				where: { id: userId },
				data: { defaultOskId: school.id },
			});
		}

		return tx.drivingSchool.findUniqueOrThrow({
			where: { id: school.id },
			include: {
				settings: settingsIncludeOffered,
			},
		});
	});

	if (!isFirstSchool) {
		const schools = await prisma.drivingSchool.findMany({
			where: activeSchoolClause({ ownerId: userId }),
		});
		const ownerRow = await prisma.user.findUnique({
			where: { id: userId },
			select: { defaultOskId: true },
		});
		await reconcileUserDefaultOskId(
			userId,
			schools,
			ownerRow?.defaultOskId ?? null,
		);
	}

	return mapSchoolWithOfferedSettings(newSchool);
}

export async function setDefaultDrivingSchoolForOwner(
	userId: string,
	id: string,
) {
	const school = await loadOwnedActiveDrivingSchoolOrThrow(userId, id);

	await prisma.user.update({
		where: { id: userId },
		data: { defaultOskId: school.id },
	});

	return { defaultOskId: school.id };
}

export async function setDefaultVehicleForDrivingSchoolOwner(
	userId: string,
	schoolId: string,
	vehicleId: string,
) {
	await loadOwnedActiveDrivingSchoolOrThrow(userId, schoolId);

	const vehicle = await prisma.vehicle.findUnique({
		where: { id: vehicleId },
		select: { id: true, schoolId: true, isActive: true },
	});

	if (!vehicle) {
		throw AppError.notFound('Vehicle not found');
	}

	if (!vehicle.isActive) {
		throw AppError.notFound('Vehicle not found');
	}

	if (vehicle.schoolId !== schoolId) {
		throw AppError.forbidden('Forbidden');
	}

	await prisma.drivingSchool.update({
		where: { id: schoolId },
		data: { defaultVehicleId: vehicleId },
	});

	return { defaultVehicleId: vehicleId };
}

export async function updateDrivingSchoolForOwner(
	userId: string,
	id: string,
	data: UpdateDrivingSchoolInput,
) {
	await loadOwnedActiveDrivingSchoolOrThrow(userId, id);

	await assertOfferedCourseTypesExist(data.offeredCourseTypeIds);
	const schoolUpdate = buildDrivingSchoolScalarUpdate(data);
	const hasSchoolScalarUpdate = Object.keys(schoolUpdate).length > 0;
	const hasSettingsUpdate = hasDrivingSchoolSettingsUpdate(data);

	const updated = await prisma.$transaction(async (tx) => {
		if (hasSchoolScalarUpdate) {
			await tx.drivingSchool.update({
				where: { id },
				data: schoolUpdate,
			});
		}

		if (hasSettingsUpdate) {
			await upsertDrivingSchoolSettings(tx, id, data);
		}

		return tx.drivingSchool.findUniqueOrThrow({
			where: { id },
			include: {
				settings: settingsIncludeOffered,
			},
		});
	});

	return mapSchoolWithOfferedSettings(updated);
}

export async function deleteDrivingSchoolForOwner(
	userId: string,
	id: string,
) {
	await loadOwnedActiveDrivingSchoolOrThrow(userId, id);

	const payload = await prisma.$transaction(async (tx) => {
		const dbUser = await tx.user.findUnique({
			where: { id: userId },
			select: { defaultOskId: true },
		});

		const wasDefault = dbUser?.defaultOskId === id;

		await tx.drivingSchool.update({
			where: { id },
			data: { deletedAt: new Date() },
		});

		if (!wasDefault) {
			return {
				id,
				defaultOskId: dbUser?.defaultOskId ?? null,
			};
		}

		const next = await tx.drivingSchool.findFirst({
			where: activeSchoolClause({ ownerId: userId }),
			orderBy: { createdAt: 'asc' },
		});

		const defaultOskId = next?.id ?? null;

		await tx.user.update({
			where: { id: userId },
			data: { defaultOskId },
		});

		return { id, defaultOskId };
	});

	const schoolsAfter = await prisma.drivingSchool.findMany({
		where: activeSchoolClause({ ownerId: userId }),
	});
	const ownerAfter = await prisma.user.findUnique({
		where: { id: userId },
		select: { defaultOskId: true },
	});
	const defaultOskId = await reconcileUserDefaultOskId(
		userId,
		schoolsAfter,
		ownerAfter?.defaultOskId ?? null,
	);

	return { id: payload.id, defaultOskId };
}
