import { Request, Response } from 'express';
import { sendJsonError, sendJsonSuccess } from '../lib/apiResponse';
import { getPrisma } from '../lib/prisma';

const prisma = getPrisma();

/** Aktywne OSK (bez soft-delete). */
function activeSchoolClause<T extends Record<string, unknown>>(extra: T) {
	return { ...extra, deletedAt: null };
}

const DRIVING_SCHOOL_ID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** `:id` ze ścieżki — trim (np. \\n z klienta) + walidacja UUID → unik błędów Prisma. */
function parseDrivingSchoolIdParam(
	raw: string | string[] | undefined,
): string | null {
	if (raw === undefined) {
		return null;
	}
	const single = Array.isArray(raw) ? raw[0] : raw;
	if (typeof single !== 'string') {
		return null;
	}
	const id = single.trim();
	return DRIVING_SCHOOL_ID_RE.test(id) ? id : null;
}

type DefaultOskSchoolRow = { id: string; createdAt: Date };

/**
 * defaultOskId musi być null lub wskazywać aktywny OSK z `schools` (właściciel).
 * Inaczej: naprawa w DB — najwcześniejszy z listy albo null przy braku szkół.
 */
async function reconcileUserDefaultOskId(
	userId: string,
	schools: DefaultOskSchoolRow[],
	storedDefaultId: string | null,
): Promise<string | null> {
	const ownedIds = new Set(schools.map((s) => s.id));
	const defaultIsValid =
		storedDefaultId !== null && ownedIds.has(storedDefaultId);

	if (defaultIsValid) {
		return storedDefaultId;
	}

	if (schools.length > 0) {
		const earliest = schools.reduce((a, b) =>
			a.createdAt <= b.createdAt ? a : b,
		);
		await prisma.user.update({
			where: { id: userId },
			data: { defaultOskId: earliest.id },
		});
		return earliest.id;
	}

	if (storedDefaultId !== null) {
		await prisma.user.update({
			where: { id: userId },
			data: { defaultOskId: null },
		});
	}

	return null;
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
	const user = (req as any).user;
	const id = parseDrivingSchoolIdParam(req.params.id);
	if (!id) {
		return sendJsonError(res, 'Invalid driving school id', 400);
	}

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

async function updateDrivingSchool(req: Request, res: Response) {
	const user = (req as any).user;
	const id = parseDrivingSchoolIdParam(req.params.id);
	if (!id) {
		return sendJsonError(res, 'Invalid driving school id', 400);
	}

	const { name, city, address } = req.body as Record<string, unknown>;

	const data: {
		name?: string;
		city?: string | null;
		address?: string | null;
	} = {};

	if (name !== undefined) {
		if (typeof name !== 'string' || name.trim() === '') {
			return sendJsonError(res, 'Name cannot be empty', 400);
		}
		data.name = name.trim();
	}

	if (city !== undefined) {
		if (city !== null && typeof city !== 'string') {
			return sendJsonError(res, 'city must be a string or null', 400);
		}
		data.city = city === null ? null : (city as string).trim() || null;
	}

	if (address !== undefined) {
		if (address !== null && typeof address !== 'string') {
			return sendJsonError(res, 'address must be a string or null', 400);
		}
		data.address =
			address === null ? null : (address as string).trim() || null;
	}

	if (Object.keys(data).length === 0) {
		return sendJsonError(res, 'No fields to update', 400);
	}

	const school = await prisma.drivingSchool.findUnique({
		where: { id },
	});

	if (!school || school.deletedAt !== null) {
		return sendJsonError(res, 'Driving school not found', 404);
	}

	if (school.ownerId !== user.id) {
		return sendJsonError(res, 'Forbidden', 403);
	}

	const updated = await prisma.drivingSchool.update({
		where: { id },
		data,
	});

	return sendJsonSuccess(res, updated);
}

async function deleteDrivingSchool(req: Request, res: Response) {
	const user = (req as any).user;
	const id = parseDrivingSchoolIdParam(req.params.id);
	if (!id) {
		return sendJsonError(res, 'Invalid driving school id', 400);
	}

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

export {
	getDrivingSchools,
	createDrivingSchool,
	setDefaultDrivingSchool,
	updateDrivingSchool,
	deleteDrivingSchool,
};
