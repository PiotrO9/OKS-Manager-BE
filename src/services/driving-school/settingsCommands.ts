import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import type { updateDrivingSchoolBodySchema } from '../../schemas/driving-school.schemas';

const prisma = getPrisma();

type UpdateDrivingSchoolInput = z.infer<typeof updateDrivingSchoolBodySchema>;
type SchoolScalarUpdate = {
	name?: string;
	city?: string | null;
	address?: string | null;
};

export async function assertOfferedCourseTypesExist(
	ids: string[] | undefined,
): Promise<void> {
	if (ids === undefined) {
		return;
	}

	const found = await prisma.courseType.count({
		where: { id: { in: ids } },
	});
	if (found !== ids.length) {
		throw AppError.badRequest('Invalid offeredCourseTypeIds');
	}
}

export function buildDrivingSchoolScalarUpdate(
	data: UpdateDrivingSchoolInput,
): SchoolScalarUpdate {
	const schoolUpdate: SchoolScalarUpdate = {};

	if (data.name !== undefined) {
		schoolUpdate.name = data.name;
	}
	if (data.city !== undefined) {
		schoolUpdate.city = data.city;
	}
	if (data.address !== undefined) {
		schoolUpdate.address = data.address;
	}

	return schoolUpdate;
}

export function hasDrivingSchoolSettingsUpdate(
	data: UpdateDrivingSchoolInput,
): boolean {
	return (
		data.enabledCourseKinds !== undefined ||
		data.offeredCourseTypeIds !== undefined
	);
}

export async function upsertDrivingSchoolSettings(
	tx: Prisma.TransactionClient,
	schoolId: string,
	data: UpdateDrivingSchoolInput,
): Promise<void> {
	const createData: Prisma.SchoolSettingsUncheckedCreateInput = {
		schoolId,
		enabledCourseKinds:
			data.enabledCourseKinds !== undefined
				? data.enabledCourseKinds
				: [],
	};

	if (
		data.offeredCourseTypeIds !== undefined &&
		data.offeredCourseTypeIds.length > 0
	) {
		createData.offeredCourseTypes = {
			connect: data.offeredCourseTypeIds.map((cid) => ({
				id: cid,
			})),
		};
	}

	const updateData: Prisma.SchoolSettingsUpdateInput = {};
	if (data.enabledCourseKinds !== undefined) {
		updateData.enabledCourseKinds = {
			set: data.enabledCourseKinds,
		};
	}
	if (data.offeredCourseTypeIds !== undefined) {
		updateData.offeredCourseTypes = {
			set: data.offeredCourseTypeIds.map((cid) => ({ id: cid })),
		};
	}

	await tx.schoolSettings.upsert({
		where: { schoolId },
		create: createData,
		update: updateData,
	});
}
