import type { CourseKind } from '@prisma/client';
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
import {
	activeSchoolClause,
	reconcileUserDefaultOskId,
} from '../services/oskContext';

const prisma = getPrisma();

const DEFAULT_ENABLED_COURSE_KINDS: CourseKind[] = [
	'THEORY_GROUP',
	'PRACTICAL',
	'EXTRA',
];

async function getDrivingSchools(req: Request, res: Response) {
	const user = requireUser(req);

	const [schools, owner] = await Promise.all([
		prisma.drivingSchool.findMany({
			where: activeSchoolClause({ ownerId: user.id }),
			include: {
				settings: { select: { enabledCourseKinds: true } },
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

	const { name, city, address, enabledCourseKinds } = parsed.data;
	const kindsToStore = enabledCourseKinds ?? DEFAULT_ENABLED_COURSE_KINDS;

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

		await tx.schoolSettings.create({
			data: {
				schoolId: school.id,
				enabledCourseKinds: kindsToStore,
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
				settings: { select: { enabledCourseKinds: true } },
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

	const updated = await prisma.$transaction(async (tx) => {
		if (hasSchoolScalarUpdate) {
			await tx.drivingSchool.update({
				where: { id },
				data: schoolUpdate,
			});
		}

		if (data.enabledCourseKinds !== undefined) {
			await tx.schoolSettings.upsert({
				where: { schoolId: id },
				create: {
					schoolId: id,
					enabledCourseKinds: data.enabledCourseKinds,
				},
				update: {
					enabledCourseKinds: data.enabledCourseKinds,
				},
			});
		}

		return tx.drivingSchool.findUniqueOrThrow({
			where: { id },
			include: {
				settings: { select: { enabledCourseKinds: true } },
			},
		});
	});

	const { settings: updSettings, ...updRest } = updated;
	return sendJsonSuccess(res, {
		...updRest,
		enabledCourseKinds: updSettings?.enabledCourseKinds ?? [],
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
		include: { settings: true },
	});

	if (!school || school.deletedAt !== null) {
		throw AppError.notFound('Driving school not found');
	}

	const isManager = school.ownerId === user.id;
	const { settings: defSettings, ...defRest } = school;

	return sendJsonSuccess(res, {
		...defRest,
		enabledCourseKinds: defSettings?.enabledCourseKinds ?? [],
		settings: defSettings,
		isManager,
	});
}

export {
	getDrivingSchools,
	getDefaultDrivingSchool,
	createDrivingSchool,
	setDefaultDrivingSchool,
	setDefaultVehicleForDrivingSchool,
	updateDrivingSchool,
	deleteDrivingSchool,
};
