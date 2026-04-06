import { Request, Response } from 'express';
import { sendJsonError, sendJsonSuccess } from '../lib/apiResponse';
import { getPrisma } from '../lib/prisma';
import { getResolvedDefaultOskIdForOwner } from '../driving-schools/oskContext';

const prisma = getPrisma();

const UUID_BODY_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseVehicleIdFromBody(raw: unknown): string | null | 'invalid' {
	if (raw === undefined || raw === null) {
		return null;
	}
	if (typeof raw !== 'string') {
		return 'invalid';
	}
	const id = raw.trim();
	if (id === '') {
		return null;
	}
	return UUID_BODY_RE.test(id) ? id : 'invalid';
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

	const nameRaw = body.name;
	if (typeof nameRaw !== 'string' || nameRaw.trim() === '') {
		return sendJsonError(res, 'name is required', 400);
	}
	const name = nameRaw.trim();

	const regRaw = body.registrationNumber;
	if (typeof regRaw !== 'string' || regRaw.trim() === '') {
		return sendJsonError(res, 'registrationNumber is required', 400);
	}
	const registrationNumber = regRaw.trim();

	const insp = parseOptionalDate(body.inspectionDate, 'inspectionDate');
	if (!insp.ok) {
		return sendJsonError(res, insp.message, 400);
	}
	const ins = parseOptionalDate(body.insuranceDate, 'insuranceDate');
	if (!ins.ok) {
		return sendJsonError(res, ins.message, 400);
	}

	const inspectionDate = insp.value;
	const insuranceDate = ins.value;

	if (idParse === null) {
		const schoolId = await getResolvedDefaultOskIdForOwner(user.id);
		if (!schoolId) {
			return sendJsonError(
				res,
				'No driving school context for this user',
				403,
			);
		}

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

	const school = await prisma.drivingSchool.findUnique({
		where: { id: existing.schoolId },
	});

	if (!school || school.deletedAt !== null || school.ownerId !== user.id) {
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

export { upsertVehicle };
