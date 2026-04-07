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

async function getDrivingSchools(req: Request, res: Response) {
	const user = requireUser(req);

	const [schools, owner] = await Promise.all([
		prisma.drivingSchool.findMany({
			where: activeSchoolClause({ ownerId: user.id }),
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

	const schoolsWithDefault = schools.map((school) => ({
		...school,
		isDefault: defaultOskId !== null && school.id === defaultOskId,
	}));

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

		return school;
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

	return sendJsonSuccess(res, newSchool, 201);
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

	const updated = await prisma.drivingSchool.update({
		where: { id },
		data,
	});

	return sendJsonSuccess(res, updated);
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

	return sendJsonSuccess(res, { ...school, isManager });
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
