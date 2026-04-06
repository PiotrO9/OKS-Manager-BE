import { Request, Response } from 'express';
import type { DrivingSchool } from '@prisma/client';
import { sendJsonError, sendJsonSuccess } from '../lib/apiResponse';
import { getPrisma } from '../lib/prisma';

const prisma = getPrisma();

const UUID_PARAM_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Body lub query — brak / pusty → null, zły typ lub format → invalid. */
function parseUuidParam(raw: unknown): string | null | 'invalid' {
	if (raw === undefined || raw === null) {
		return null;
	}
	if (Array.isArray(raw)) {
		if (raw.length === 0) {
			return null;
		}
		return parseUuidParam(raw[0]);
	}
	if (typeof raw !== 'string') {
		return 'invalid';
	}
	const id = raw.trim();
	if (id === '') {
		return null;
	}
	return UUID_PARAM_RE.test(id) ? id : 'invalid';
}

/** `:id` ze ścieżki — trim + UUID. */
function parseVehicleIdParam(
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
	return UUID_PARAM_RE.test(id) ? id : null;
}

function parseVehicleIdFromBody(raw: unknown): string | null | 'invalid' {
	return parseUuidParam(raw);
}

function parseOptionalDate(
	raw: unknown,
	fieldLabel: string,
): { ok: true; value: Date | null } | { ok: false; message: string } {
	if (raw === undefined || raw === null) {
		return { ok: true, value: null };
	}
	if (typeof raw === 'string' && raw.trim() === '') {
		return { ok: true, value: null };
	}
	if (typeof raw !== 'string') {
		return {
			ok: false,
			message: `${fieldLabel} must be a string, null, or omitted`,
		};
	}
	const t = Date.parse(raw.trim());
	if (Number.isNaN(t)) {
		return { ok: false, message: `${fieldLabel} must be a valid ISO date` };
	}
	return { ok: true, value: new Date(t) };
}

function parseVehicleWriteBody(body: Record<string, unknown>):
	| {
			ok: true;
			name: string;
			registrationNumber: string;
			inspectionDate: Date | null;
			insuranceDate: Date | null;
	  }
	| { ok: false; error: string } {
	const nameRaw = body.name;
	if (typeof nameRaw !== 'string' || nameRaw.trim() === '') {
		return { ok: false, error: 'name is required' };
	}
	const name = nameRaw.trim();

	const regRaw = body.registrationNumber;
	if (typeof regRaw !== 'string' || regRaw.trim() === '') {
		return { ok: false, error: 'registrationNumber is required' };
	}
	const registrationNumber = regRaw.trim();

	const insp = parseOptionalDate(body.inspectionDate, 'inspectionDate');
	if (!insp.ok) {
		return { ok: false, error: insp.message };
	}
	const ins = parseOptionalDate(body.insuranceDate, 'insuranceDate');
	if (!ins.ok) {
		return { ok: false, error: ins.message };
	}

	return {
		ok: true,
		name,
		registrationNumber,
		inspectionDate: insp.value,
		insuranceDate: ins.value,
	};
}

async function getSchoolOwnedByUser(
	userId: string,
	schoolId: string,
): Promise<DrivingSchool | null> {
	const school = await prisma.drivingSchool.findUnique({
		where: { id: schoolId },
	});
	if (!school || school.deletedAt !== null || school.ownerId !== userId) {
		return null;
	}
	return school;
}

async function loadVehicleForOwner(
	userId: string,
	vehicleId: string,
): Promise<
	| { ok: true; vehicle: { id: string; schoolId: string } }
	| { ok: false; notFound: boolean }
> {
	const vehicle = await prisma.vehicle.findUnique({
		where: { id: vehicleId },
		select: { id: true, schoolId: true },
	});
	if (!vehicle) {
		return { ok: false, notFound: true };
	}
	const allowed = await getSchoolOwnedByUser(userId, vehicle.schoolId);
	if (!allowed) {
		return { ok: false, notFound: false };
	}
	return { ok: true, vehicle };
}

async function listVehiclesBySchool(req: Request, res: Response) {
	const user = (req as any).user;
	if (!user) {
		return sendJsonError(res, 'Unauthorized', 401);
	}

	const schoolIdParse = parseUuidParam(req.query.schoolId);
	if (schoolIdParse === null) {
		return sendJsonError(res, 'schoolId is required', 400);
	}
	if (schoolIdParse === 'invalid') {
		return sendJsonError(res, 'Invalid schoolId', 400);
	}

	const school = await getSchoolOwnedByUser(user.id, schoolIdParse);
	if (!school) {
		return sendJsonError(res, 'Forbidden', 403);
	}

	const vehicles = await prisma.vehicle.findMany({
		where: { schoolId: schoolIdParse },
		orderBy: { createdAt: 'asc' },
	});

	return sendJsonSuccess(res, { vehicles });
}

async function upsertVehicle(req: Request, res: Response) {
	const user = (req as any).user;
	if (!user) {
		return sendJsonError(res, 'Unauthorized', 401);
	}

	const body = req.body as Record<string, unknown>;
	const idParse = parseVehicleIdFromBody(body.id);
	if (idParse === 'invalid') {
		return sendJsonError(res, 'Invalid vehicle id', 400);
	}

	const payload = parseVehicleWriteBody(body);
	if (!payload.ok) {
		return sendJsonError(res, payload.error, 400);
	}

	const { name, registrationNumber, inspectionDate, insuranceDate } = payload;

	if (idParse === null) {
		const schoolIdParse = parseUuidParam(body.schoolId);
		if (schoolIdParse === null) {
			return sendJsonError(res, 'schoolId is required', 400);
		}
		if (schoolIdParse === 'invalid') {
			return sendJsonError(res, 'Invalid schoolId', 400);
		}

		const schoolRow = await getSchoolOwnedByUser(user.id, schoolIdParse);
		if (!schoolRow) {
			return sendJsonError(res, 'Forbidden', 403);
		}

		const schoolId = schoolIdParse;

		const duplicate = await prisma.vehicle.findFirst({
			where: { schoolId, registrationNumber },
		});
		if (duplicate) {
			return sendJsonError(
				res,
				'registrationNumber already exists for this driving school',
				409,
			);
		}

		const created = await prisma.vehicle.create({
			data: {
				schoolId,
				name,
				registrationNumber,
				inspectionDate,
				insuranceDate,
			},
		});

		return sendJsonSuccess(res, created, 201);
	}

	const existing = await prisma.vehicle.findUnique({
		where: { id: idParse },
	});

	if (!existing) {
		return sendJsonError(res, 'Vehicle not found', 404);
	}

	const school = await getSchoolOwnedByUser(user.id, existing.schoolId);
	if (!school) {
		return sendJsonError(res, 'Forbidden', 403);
	}

	const duplicate = await prisma.vehicle.findFirst({
		where: {
			schoolId: existing.schoolId,
			registrationNumber,
			id: { not: idParse },
		},
	});
	if (duplicate) {
		return sendJsonError(
			res,
			'registrationNumber already exists for this driving school',
			409,
		);
	}

	const updated = await prisma.vehicle.update({
		where: { id: idParse },
		data: {
			name,
			registrationNumber,
			inspectionDate,
			insuranceDate,
		},
	});

	return sendJsonSuccess(res, updated);
}

async function updateVehicle(req: Request, res: Response) {
	const user = (req as any).user;
	if (!user) {
		return sendJsonError(res, 'Unauthorized', 401);
	}

	const vehicleId = parseVehicleIdParam(req.params.id);
	if (!vehicleId) {
		return sendJsonError(res, 'Invalid vehicle id', 400);
	}

	const loaded = await loadVehicleForOwner(user.id, vehicleId);
	if (!loaded.ok) {
		if (loaded.notFound) {
			return sendJsonError(res, 'Vehicle not found', 404);
		}
		return sendJsonError(res, 'Forbidden', 403);
	}

	const body = req.body as Record<string, unknown>;
	const payload = parseVehicleWriteBody(body);
	if (!payload.ok) {
		return sendJsonError(res, payload.error, 400);
	}

	const { name, registrationNumber, inspectionDate, insuranceDate } = payload;

	const duplicate = await prisma.vehicle.findFirst({
		where: {
			schoolId: loaded.vehicle.schoolId,
			registrationNumber,
			id: { not: vehicleId },
		},
	});
	if (duplicate) {
		return sendJsonError(
			res,
			'registrationNumber already exists for this driving school',
			409,
		);
	}

	const updated = await prisma.vehicle.update({
		where: { id: vehicleId },
		data: {
			name,
			registrationNumber,
			inspectionDate,
			insuranceDate,
		},
	});

	return sendJsonSuccess(res, updated);
}

async function deleteVehicle(req: Request, res: Response) {
	const user = (req as any).user;
	if (!user) {
		return sendJsonError(res, 'Unauthorized', 401);
	}

	const vehicleId = parseVehicleIdParam(req.params.id);
	if (!vehicleId) {
		return sendJsonError(res, 'Invalid vehicle id', 400);
	}

	const loaded = await loadVehicleForOwner(user.id, vehicleId);
	if (!loaded.ok) {
		if (loaded.notFound) {
			return sendJsonError(res, 'Vehicle not found', 404);
		}
		return sendJsonError(res, 'Forbidden', 403);
	}

	await prisma.vehicle.delete({
		where: { id: vehicleId },
	});

	return sendJsonSuccess(res, { id: vehicleId });
}

export { upsertVehicle, listVehiclesBySchool, updateVehicle, deleteVehicle };
