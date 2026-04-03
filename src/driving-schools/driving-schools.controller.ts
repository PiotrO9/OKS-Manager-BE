import { Request, Response } from 'express';
import { sendJsonError, sendJsonSuccess } from '../lib/apiResponse';
import { getPrisma } from '../lib/prisma';

const prisma = getPrisma();

/** Aktywne OSK (bez soft-delete). */
function activeSchoolClause<T extends Record<string, unknown>>(extra: T) {
	return { ...extra, deletedAt: null };
}

async function getDrivingSchools(req: Request, res: Response) {
	const user = (req as any).user;

	if (!user) {
		return sendJsonError(res, 'Unauthorized', 401);
	}

	const [schools, owner] = await Promise.all([
		prisma.drivingSchool.findMany({
			where: activeSchoolClause({ ownerId: user.id }),
		}),
		prisma.user.findUnique({
			where: { id: user.id },
			select: { defaultOskId: true },
		}),
	]);

	const defaultOskId = owner?.defaultOskId ?? null;

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
	const user = (req as any).user;
	const { name, city, address } = req.body;

	if (!name || typeof name !== 'string' || name.trim() === '') {
		return sendJsonError(res, 'Name is required', 400);
	}

	const existingCount = await prisma.drivingSchool.count({
		where: activeSchoolClause({ ownerId: user.id }),
	});

	const isFirstSchool = existingCount === 0;

	const newSchool = await prisma.$transaction(async (tx) => {
		const school = await tx.drivingSchool.create({
			data: {
				name: name.trim(),
				city: city?.trim() ?? null,
				address: address?.trim() ?? null,
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

	return sendJsonSuccess(res, newSchool, 201);
}

async function setDefaultDrivingSchool(req: Request, res: Response) {
	const user = (req as any).user;
	const id = req.params.id as string;

	const school = await prisma.drivingSchool.findUnique({
		where: { id },
	});

	if (!school || school.deletedAt !== null) {
		return sendJsonError(res, 'Driving school not found', 404);
	}

	if (school.ownerId !== user.id) {
		return sendJsonError(res, 'Forbidden', 403);
	}

	await prisma.user.update({
		where: { id: user.id },
		data: { defaultOskId: school.id },
	});

	return sendJsonSuccess(res, { defaultOskId: school.id });
}

async function deleteDrivingSchool(req: Request, res: Response) {
	const user = (req as any).user;
	const id = req.params.id as string;

	const school = await prisma.drivingSchool.findUnique({
		where: { id },
	});

	if (!school || school.deletedAt !== null) {
		return sendJsonError(res, 'Driving school not found', 404);
	}

	if (school.ownerId !== user.id) {
		return sendJsonError(res, 'Forbidden', 403);
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

	return sendJsonSuccess(res, payload);
}

export {
	getDrivingSchools,
	createDrivingSchool,
	setDefaultDrivingSchool,
	deleteDrivingSchool,
};
