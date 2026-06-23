import type { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { AppError } from '../lib/http/AppError';
import { requireUser } from '../lib/http/requireUser';
import { getPrisma } from '../lib/prisma';
import {
	createDrivingSchoolBodySchema,
	drivingSchoolIdParamsSchema,
	setDefaultVehicleBodySchema,
	updateDrivingSchoolBodySchema,
} from '../schemas/driving-school.schemas';
import { schoolAvailabilitySlotsQuerySchema } from '../schemas/school-availability.schemas';
import { listSchoolAvailabilitySlots } from '../services/school-availability.service';
import {
	activeSchoolClause,
	reconcileUserDefaultOskId,
} from '../services/oskContext';

const prisma = getPrisma();

const settingsIncludeOffered = {
	select: {
		enabledCourseKinds: true,
		offeredCourseTypes: { select: { id: true, code: true, name: true } },
	},
} as const;

async function getDrivingSchools(req: Request, res: Response) {
	const user = requireUser(req);

	const [schools, owner] = await Promise.all([
		prisma.drivingSchool.findMany({
			where: activeSchoolClause({ ownerId: user.id }),
			include: {
				settings: settingsIncludeOffered,
			},
		}),
		prisma.user.findUnique({
			where: { id: user.id },
			select: { defaultOskId: true },
		}),
	]);

	const defaultOskId = await reconcileUserDefaultOskId(
		user.id,
		schools,
		owner?.defaultOskId ?? null,
	);

	const schoolsWithDefault = schools.map((school) => {
		const { settings, ...rest } = school;
		return {
			...rest,
			enabledCourseKinds: settings?.enabledCourseKinds ?? [],
			offeredCourseTypes: settings?.offeredCourseTypes ?? [],
			isDefault: defaultOskId !== null && school.id === defaultOskId,
		};
	});

	return sendJsonSuccess(res, {
		schools: schoolsWithDefault,
		defaultOskId,
	});
}

async function createDrivingSchool(req: Request, res: Response) {
	const user = requireUser(req);
	const parsed = createDrivingSchoolBodySchema.safeParse(req.body);
	if (!parsed.success) {
		const message = parsed.error.issues[0]?.message ?? 'Invalid body';
		throw AppError.badRequest(message);
	}

	const { name, city, address } = parsed.data;

	const existingCount = await prisma.drivingSchool.count({
		where: activeSchoolClause({ ownerId: user.id }),
	});

	const isFirstSchool = existingCount === 0;

	const newSchool = await prisma.$transaction(async (tx) => {
		const school = await tx.drivingSchool.create({
			data: {
				name,
				city,
				address,
				ownerId: user.id,
			},
		});

		if (isFirstSchool) {
			await tx.user.update({
				where: { id: user.id },
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
			where: activeSchoolClause({ ownerId: user.id }),
		});
		const ownerRow = await prisma.user.findUnique({
			where: { id: user.id },
			select: { defaultOskId: true },
		});
		await reconcileUserDefaultOskId(
			user.id,
			schools,
			ownerRow?.defaultOskId ?? null,
		);
	}

	const { settings: createdSettings, ...createdRest } = newSchool;
	return sendJsonSuccess(
		res,
		{
			...createdRest,
			enabledCourseKinds: createdSettings?.enabledCourseKinds ?? [],
			offeredCourseTypes: createdSettings?.offeredCourseTypes ?? [],
		},
		201,
	);
}

async function setDefaultDrivingSchool(req: Request, res: Response) {
	const user = requireUser(req);
	const params = drivingSchoolIdParamsSchema.safeParse(req.params);
	if (!params.success) {
		throw AppError.badRequest('Invalid driving school id');
	}
	const id = params.data.id;

	const school = await prisma.drivingSchool.findUnique({
		where: { id },
	});

	if (!school || school.deletedAt !== null) {
		throw AppError.notFound('Driving school not found');
	}

	if (school.ownerId !== user.id) {
		throw AppError.forbidden('Forbidden');
	}

	await prisma.user.update({
		where: { id: user.id },
		data: { defaultOskId: school.id },
	});

	return sendJsonSuccess(res, { defaultOskId: school.id });
}

async function setDefaultVehicleForDrivingSchool(req: Request, res: Response) {
	const user = requireUser(req);
	const params = drivingSchoolIdParamsSchema.safeParse(req.params);
	if (!params.success) {
		throw AppError.badRequest('Invalid driving school id');
	}
	const schoolId = params.data.id;

	const bodyParsed = setDefaultVehicleBodySchema.safeParse(req.body);
	if (!bodyParsed.success) {
		const msg = bodyParsed.error.issues[0]?.message ?? 'Invalid body';
		throw AppError.badRequest(msg);
	}
	const vehicleId = bodyParsed.data.vehicleId;

	const school = await prisma.drivingSchool.findUnique({
		where: { id: schoolId },
	});

	if (!school || school.deletedAt !== null) {
		throw AppError.notFound('Driving school not found');
	}

	if (school.ownerId !== user.id) {
		throw AppError.forbidden('Forbidden');
	}

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

	return sendJsonSuccess(res, { defaultVehicleId: vehicleId });
}

async function updateDrivingSchool(req: Request, res: Response) {
	const user = requireUser(req);
	const params = drivingSchoolIdParamsSchema.safeParse(req.params);
	if (!params.success) {
		throw AppError.badRequest('Invalid driving school id');
	}
	const id = params.data.id;

	const parsed = updateDrivingSchoolBodySchema.safeParse(req.body);
	if (!parsed.success) {
		const message = parsed.error.issues[0]?.message ?? 'Invalid body';
		throw AppError.badRequest(message);
	}

	const data = parsed.data;

	const school = await prisma.drivingSchool.findUnique({
		where: { id },
	});

	if (!school || school.deletedAt !== null) {
		throw AppError.notFound('Driving school not found');
	}

	if (school.ownerId !== user.id) {
		throw AppError.forbidden('Forbidden');
	}

	if (data.offeredCourseTypeIds !== undefined) {
		const ids = data.offeredCourseTypeIds;
		const found = await prisma.courseType.count({
			where: { id: { in: ids } },
		});
		if (found !== ids.length) {
			throw AppError.badRequest('Invalid offeredCourseTypeIds');
		}
	}

	const schoolUpdate: {
		name?: string;
		city?: string | null;
		address?: string | null;
	} = {};
	if (data.name !== undefined) {
		schoolUpdate.name = data.name;
	}
	if (data.city !== undefined) {
		schoolUpdate.city = data.city;
	}
	if (data.address !== undefined) {
		schoolUpdate.address = data.address;
	}

	const hasSchoolScalarUpdate = Object.keys(schoolUpdate).length > 0;
	const hasSettingsUpdate =
		data.enabledCourseKinds !== undefined ||
		data.offeredCourseTypeIds !== undefined;

	const updated = await prisma.$transaction(async (tx) => {
		if (hasSchoolScalarUpdate) {
			await tx.drivingSchool.update({
				where: { id },
				data: schoolUpdate,
			});
		}

		if (hasSettingsUpdate) {
			const createData: Prisma.SchoolSettingsUncheckedCreateInput = {
				schoolId: id,
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
				where: { schoolId: id },
				create: createData,
				update: updateData,
			});
		}

		return tx.drivingSchool.findUniqueOrThrow({
			where: { id },
			include: {
				settings: settingsIncludeOffered,
			},
		});
	});

	const { settings: updSettings, ...updRest } = updated;
	return sendJsonSuccess(res, {
		...updRest,
		enabledCourseKinds: updSettings?.enabledCourseKinds ?? [],
		offeredCourseTypes: updSettings?.offeredCourseTypes ?? [],
	});
}

async function deleteDrivingSchool(req: Request, res: Response) {
	const user = requireUser(req);
	const params = drivingSchoolIdParamsSchema.safeParse(req.params);
	if (!params.success) {
		throw AppError.badRequest('Invalid driving school id');
	}
	const id = params.data.id;

	const school = await prisma.drivingSchool.findUnique({
		where: { id },
	});

	if (!school || school.deletedAt !== null) {
		throw AppError.notFound('Driving school not found');
	}

	if (school.ownerId !== user.id) {
		throw AppError.forbidden('Forbidden');
	}

	const payload = await prisma.$transaction(async (tx) => {
		const dbUser = await tx.user.findUnique({
			where: { id: user.id },
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
			where: activeSchoolClause({ ownerId: user.id }),
			orderBy: { createdAt: 'asc' },
		});

		const defaultOskId = next?.id ?? null;

		await tx.user.update({
			where: { id: user.id },
			data: { defaultOskId },
		});

		return { id, defaultOskId };
	});

	const schoolsAfter = await prisma.drivingSchool.findMany({
		where: activeSchoolClause({ ownerId: user.id }),
	});
	const ownerAfter = await prisma.user.findUnique({
		where: { id: user.id },
		select: { defaultOskId: true },
	});
	const defaultOskId = await reconcileUserDefaultOskId(
		user.id,
		schoolsAfter,
		ownerAfter?.defaultOskId ?? null,
	);

	return sendJsonSuccess(res, { id: payload.id, defaultOskId });
}

async function getDefaultDrivingSchool(req: Request, res: Response) {
	const user = requireUser(req);

	const [schools, owner] = await Promise.all([
		prisma.drivingSchool.findMany({
			where: activeSchoolClause({ ownerId: user.id }),
			select: { id: true, createdAt: true },
		}),
		prisma.user.findUnique({
			where: { id: user.id },
			select: { defaultOskId: true },
		}),
	]);

	const defaultOskId = await reconcileUserDefaultOskId(
		user.id,
		schools,
		owner?.defaultOskId ?? null,
	);

	if (!defaultOskId) {
		throw AppError.notFound('No default driving school set');
	}

	const school = await prisma.drivingSchool.findUnique({
		where: { id: defaultOskId },
		include: {
			settings: {
				include: {
					offeredCourseTypes: {
						select: { id: true, code: true, name: true },
					},
				},
			},
		},
	});

	if (!school || school.deletedAt !== null) {
		throw AppError.notFound('Driving school not found');
	}

	const isManager = school.ownerId === user.id;
	const { settings: defSettings, ...defRest } = school;

	const offeredCourseTypes = defSettings?.offeredCourseTypes ?? [];
	const enabledCourseKinds = defSettings?.enabledCourseKinds ?? [];

	const settingsScalars =
		defSettings === null
			? null
			: (() => {
				const rest = { ...defSettings };
				delete (
					rest as Partial<typeof defSettings>
				).offeredCourseTypes;
				return rest;
			})();

	return sendJsonSuccess(res, {
		...defRest,
		enabledCourseKinds,
		offeredCourseTypes,
		settings: settingsScalars,
		isManager,
	});
}

async function getSchoolAvailabilitySlots(req: Request, res: Response) {
	const user = requireUser(req);
	const params = drivingSchoolIdParamsSchema.safeParse(req.params);
	if (!params.success) {
		throw AppError.badRequest('Invalid driving school id');
	}

	const query = schoolAvailabilitySlotsQuerySchema.safeParse(req.query);
	if (!query.success) {
		const message = query.error.issues[0]?.message ?? 'Invalid query';
		throw AppError.badRequest(message);
	}

	const data = await listSchoolAvailabilitySlots(
		{ id: user.id, role: user.role },
		params.data.id,
		query.data,
	);
	return sendJsonSuccess(res, data);
}

export {
	getDrivingSchools,
	getDefaultDrivingSchool,
	createDrivingSchool,
	setDefaultDrivingSchool,
	setDefaultVehicleForDrivingSchool,
	updateDrivingSchool,
	deleteDrivingSchool,
	getSchoolAvailabilitySlots,
};
