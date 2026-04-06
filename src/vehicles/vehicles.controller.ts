import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import type { DrivingSchool } from '@prisma/client';
import { sendJsonError, sendJsonSuccess } from '../lib/apiResponse';
import { getPrisma } from '../lib/prisma';
import { getSupabaseAdminClient } from '../lib/supabaseAdmin';

const prisma = getPrisma();

const VEHICLE_IMAGES_BUCKET =
	process.env.SUPABASE_VEHICLE_IMAGES_BUCKET ?? 'vehicle-images';

const UUID_PARAM_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ALLOWED_VEHICLE_PHOTO_MIMES = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
]);

type UploadedPhotoFile = { buffer: Buffer; mimetype: string };

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

function parseOptionalNullableInt(
	raw: unknown,
	fieldLabel: string,
): { ok: true; value: number | null } | { ok: false; message: string } {
	if (raw === undefined || raw === null) {
		return { ok: true, value: null };
	}
	if (typeof raw === 'number' && Number.isInteger(raw)) {
		if (raw < 0) {
			return { ok: false, message: `${fieldLabel} must be >= 0` };
		}
		return { ok: true, value: raw };
	}
	if (typeof raw === 'string' && raw.trim() === '') {
		return { ok: true, value: null };
	}
	if (typeof raw === 'string') {
		const n = Number.parseInt(raw.trim(), 10);
		if (!Number.isFinite(n)) {
			return { ok: false, message: `${fieldLabel} must be an integer` };
		}
		if (n < 0) {
			return { ok: false, message: `${fieldLabel} must be >= 0` };
		}
		return { ok: true, value: n };
	}
	return {
		ok: false,
		message: `${fieldLabel} must be an integer, null, or omitted`,
	};
}

function parseHttpUrlOrNull(
	raw: unknown,
	fieldLabel: string,
): { ok: true; value: string | null } | { ok: false; error: string } {
	if (raw === undefined || raw === null) {
		return { ok: true, value: null };
	}
	if (typeof raw === 'string' && raw.trim() === '') {
		return { ok: true, value: null };
	}
	if (typeof raw !== 'string') {
		return { ok: false, error: `${fieldLabel} must be a string or null` };
	}
	const t = raw.trim();
	try {
		const u = new URL(t);
		if (u.protocol !== 'http:' && u.protocol !== 'https:') {
			return {
				ok: false,
				error: `${fieldLabel} must be an http(s) URL`,
			};
		}
		return { ok: true, value: t };
	} catch {
		return { ok: false, error: `${fieldLabel} must be a valid URL` };
	}
}

type OptionalVehicleFields = {
	brand: string | null;
	model: string | null;
	photoUrl: string | null;
	modelYear: number | null;
	mileageKm: number | null;
	note: string | null;
};

type OptionalVehiclePatch = Partial<OptionalVehicleFields>;

function parseOptionalVehicleFields(
	body: Record<string, unknown>,
	mode: 'create' | 'patch',
):
	| { ok: false; error: string }
	| { ok: true; data: OptionalVehicleFields | OptionalVehiclePatch } {
	const data: Record<string, unknown> = {};

	const stringKeys = ['brand', 'model', 'note'] as const;
	for (const key of stringKeys) {
		if (mode === 'patch' && !(key in body)) {
			continue;
		}
		if (mode === 'create' && !(key in body)) {
			data[key] = null;
			continue;
		}
		const raw = body[key];
		if (raw === null) {
			data[key] = null;
			continue;
		}
		if (typeof raw !== 'string') {
			return { ok: false, error: `${key} must be a string or null` };
		}
		const t = raw.trim();
		data[key] = t === '' ? null : t;
	}

	if (mode === 'patch' && !('photoUrl' in body)) {
		// skip
	} else {
		const rawPhoto =
			mode === 'create' && !('photoUrl' in body) ? null : body.photoUrl;
		const url = parseHttpUrlOrNull(rawPhoto, 'photoUrl');
		if (!url.ok) {
			return { ok: false, error: url.error };
		}
		data.photoUrl = url.value;
	}

	for (const key of ['modelYear', 'mileageKm'] as const) {
		if (mode === 'patch' && !(key in body)) {
			continue;
		}
		const raw = mode === 'create' && !(key in body) ? null : body[key];
		const parsed = parseOptionalNullableInt(raw, key);
		if (!parsed.ok) {
			return { ok: false, error: parsed.message };
		}
		data[key] = parsed.value;
	}

	return { ok: true, data: data as OptionalVehicleFields };
}

function parseVehicleWriteBody(
	body: Record<string, unknown>,
	mode: 'create' | 'patch',
):
	| {
			ok: true;
			name: string;
			registrationNumber: string;
			inspectionDate: Date | null;
			insuranceDate: Date | null;
			optional: OptionalVehicleFields | OptionalVehiclePatch;
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

	const opt = parseOptionalVehicleFields(body, mode);
	if (!opt.ok) {
		return { ok: false, error: opt.error };
	}

	return {
		ok: true,
		name,
		registrationNumber,
		inspectionDate: insp.value,
		insuranceDate: ins.value,
		optional: opt.data,
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

type VehicleForAccessRow = {
	id: string;
	schoolId: string;
	name: string;
	registrationNumber: string;
	isActive: boolean;
	inspectionDate: Date | null;
	insuranceDate: Date | null;
	brand: string | null;
	model: string | null;
	photoUrl: string | null;
	modelYear: number | null;
	mileageKm: number | null;
	note: string | null;
	school: {
		ownerId: string;
		deletedAt: Date | null;
		defaultVehicleId: string | null;
	};
};

async function loadVehicleWithSchoolForAccess(
	vehicleId: string,
): Promise<{ kind: 'missing' } | { kind: 'ok'; row: VehicleForAccessRow }> {
	const row = await prisma.vehicle.findUnique({
		where: { id: vehicleId },
		select: {
			id: true,
			schoolId: true,
			name: true,
			registrationNumber: true,
			isActive: true,
			inspectionDate: true,
			insuranceDate: true,
			brand: true,
			model: true,
			photoUrl: true,
			modelYear: true,
			mileageKm: true,
			note: true,
			school: {
				select: {
					ownerId: true,
					deletedAt: true,
					defaultVehicleId: true,
				},
			},
		},
	});
	if (!row) {
		return { kind: 'missing' };
	}
	return { kind: 'ok', row };
}

function userMayAccessVehicleSchool(
	userId: string,
	school: { ownerId: string; deletedAt: Date | null },
): boolean {
	return school.deletedAt === null && school.ownerId === userId;
}

async function loadVehicleForOwner(
	userId: string,
	vehicleId: string,
): Promise<
	| { ok: true; vehicle: { id: string; schoolId: string; isActive: boolean } }
	| { ok: false; notFound: boolean }
> {
	const vehicle = await prisma.vehicle.findUnique({
		where: { id: vehicleId },
		select: { id: true, schoolId: true, isActive: true },
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

function fileExtensionFromMime(mime: string): string | null {
	if (mime === 'image/jpeg') {
		return 'jpg';
	}
	if (mime === 'image/png') {
		return 'png';
	}
	if (mime === 'image/webp') {
		return 'webp';
	}
	return null;
}

function extractPublicStorageObjectPath(
	publicUrl: string,
	bucket: string,
): string | null {
	try {
		const u = new URL(publicUrl);
		const marker = `/object/public/${bucket}/`;
		const idx = u.pathname.indexOf(marker);
		if (idx === -1) {
			return null;
		}

		return decodeURIComponent(u.pathname.slice(idx + marker.length));
	} catch {
		return null;
	}
}

async function removeStorageObjectBestEffort(
	objectPath: string,
	bucket: string,
): Promise<void> {
	try {
		await getSupabaseAdminClient()
			.storage.from(bucket)
			.remove([objectPath]);
	} catch {
		// best effort
	}
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
		where: { schoolId: schoolIdParse, isActive: true },
		orderBy: { createdAt: 'asc' },
	});

	const defaultVehicleId = school.defaultVehicleId ?? null;
	const vehiclesWithDefault = vehicles.map((v) => ({
		...v,
		isDefault: defaultVehicleId !== null && v.id === defaultVehicleId,
	}));

	return sendJsonSuccess(res, {
		vehicles: vehiclesWithDefault,
		defaultVehicleId,
	});
}

async function getVehicleById(req: Request, res: Response) {
	const user = (req as any).user;
	if (!user) {
		return sendJsonError(res, 'Unauthorized', 401);
	}

	const vehicleId = parseVehicleIdParam(req.params.id);
	if (!vehicleId) {
		return sendJsonError(res, 'Invalid vehicle id', 400);
	}

	const loaded = await loadVehicleWithSchoolForAccess(vehicleId);
	if (loaded.kind === 'missing') {
		return sendJsonError(res, 'Vehicle not found', 404);
	}
	if (!userMayAccessVehicleSchool(user.id, loaded.row.school)) {
		return sendJsonError(res, 'Forbidden', 403);
	}

	const { school, ...vehicle } = loaded.row;

	return sendJsonSuccess(res, {
		...vehicle,
		isDefault:
			school.defaultVehicleId !== null &&
			school.defaultVehicleId === vehicle.id,
	});
}

async function uploadVehiclePhoto(req: Request, res: Response) {
	const user = (req as any).user;
	if (!user) {
		return sendJsonError(res, 'Unauthorized', 401);
	}

	const vehicleId = parseVehicleIdParam(req.params.id);
	if (!vehicleId) {
		return sendJsonError(res, 'Invalid vehicle id', 400);
	}

	const file = (req as Request & { file?: UploadedPhotoFile }).file;
	if (!file?.buffer) {
		return sendJsonError(
			res,
			'file is required (multipart field: file)',
			400,
		);
	}
	if (!ALLOWED_VEHICLE_PHOTO_MIMES.has(file.mimetype)) {
		return sendJsonError(
			res,
			'file must be image/jpeg, image/png, or image/webp',
			400,
		);
	}

	const ext = fileExtensionFromMime(file.mimetype);
	if (!ext) {
		return sendJsonError(res, 'Unsupported image type', 400);
	}

	const loaded = await loadVehicleWithSchoolForAccess(vehicleId);
	if (loaded.kind === 'missing') {
		return sendJsonError(res, 'Vehicle not found', 404);
	}
	if (!userMayAccessVehicleSchool(user.id, loaded.row.school)) {
		return sendJsonError(res, 'Forbidden', 403);
	}

	const schoolId = loaded.row.schoolId;
	const objectPath = `${schoolId}/${vehicleId}/${randomUUID()}.${ext}`;

	let admin;
	try {
		admin = getSupabaseAdminClient();
	} catch {
		return sendJsonError(res, 'Storage is not configured', 500);
	}

	const { data: uploaded, error: uploadError } = await admin.storage
		.from(VEHICLE_IMAGES_BUCKET)
		.upload(objectPath, file.buffer, {
			contentType: file.mimetype,
			upsert: true,
		});

	if (uploadError || !uploaded?.path) {
		return sendJsonError(res, 'Upload failed', 502);
	}

	const { data: pub } = admin.storage
		.from(VEHICLE_IMAGES_BUCKET)
		.getPublicUrl(uploaded.path);
	const publicUrl = pub.publicUrl;

	const previousUrl = loaded.row.photoUrl;

	const updated = await prisma.vehicle.update({
		where: { id: vehicleId },
		data: { photoUrl: publicUrl },
		select: { photoUrl: true },
	});

	if (previousUrl) {
		const oldPath = extractPublicStorageObjectPath(
			previousUrl,
			VEHICLE_IMAGES_BUCKET,
		);
		if (oldPath && oldPath !== uploaded.path) {
			void removeStorageObjectBestEffort(oldPath, VEHICLE_IMAGES_BUCKET);
		}
	}

	return sendJsonSuccess(res, { photoUrl: updated.photoUrl });
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

	if (idParse === null) {
		const payload = parseVehicleWriteBody(body, 'create');
		if (!payload.ok) {
			return sendJsonError(res, payload.error, 400);
		}

		const {
			name,
			registrationNumber,
			inspectionDate,
			insuranceDate,
			optional,
		} = payload;

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

		const existingVehicleCount = await prisma.vehicle.count({
			where: { schoolId },
		});
		const isFirstVehicleForSchool = existingVehicleCount === 0;

		const optionalFull = optional as OptionalVehicleFields;

		const created = await prisma.$transaction(async (tx) => {
			const vehicle = await tx.vehicle.create({
				data: {
					schoolId,
					name,
					registrationNumber,
					inspectionDate,
					insuranceDate,
					brand: optionalFull.brand,
					model: optionalFull.model,
					photoUrl: optionalFull.photoUrl,
					modelYear: optionalFull.modelYear,
					mileageKm: optionalFull.mileageKm,
					note: optionalFull.note,
				},
			});

			if (isFirstVehicleForSchool) {
				await tx.drivingSchool.update({
					where: { id: schoolId },
					data: { defaultVehicleId: vehicle.id },
				});
			}

			return vehicle;
		});

		return sendJsonSuccess(res, created, 201);
	}

	const patchPayload = parseVehicleWriteBody(body, 'patch');
	if (!patchPayload.ok) {
		return sendJsonError(res, patchPayload.error, 400);
	}

	const {
		name,
		registrationNumber,
		inspectionDate,
		insuranceDate,
		optional,
	} = patchPayload;

	const existing = await prisma.vehicle.findUnique({
		where: { id: idParse },
		select: {
			id: true,
			schoolId: true,
			isActive: true,
		},
	});

	if (!existing) {
		return sendJsonError(res, 'Vehicle not found', 404);
	}

	const school = await getSchoolOwnedByUser(user.id, existing.schoolId);
	if (!school) {
		return sendJsonError(res, 'Forbidden', 403);
	}

	if (!existing.isActive) {
		return sendJsonError(res, 'Vehicle not found', 404);
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

	const optionalPatch = optional as OptionalVehiclePatch;

	const updated = await prisma.vehicle.update({
		where: { id: idParse },
		data: {
			name,
			registrationNumber,
			inspectionDate,
			insuranceDate,
			...optionalPatch,
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

	if (!loaded.vehicle.isActive) {
		return sendJsonError(res, 'Vehicle not found', 404);
	}

	const body = req.body as Record<string, unknown>;
	const payload = parseVehicleWriteBody(body, 'patch');
	if (!payload.ok) {
		return sendJsonError(res, payload.error, 400);
	}

	const {
		name,
		registrationNumber,
		inspectionDate,
		insuranceDate,
		optional,
	} = payload;

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

	const optionalPatch = optional as OptionalVehiclePatch;

	const updated = await prisma.vehicle.update({
		where: { id: vehicleId },
		data: {
			name,
			registrationNumber,
			inspectionDate,
			insuranceDate,
			...optionalPatch,
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

	if (!loaded.vehicle.isActive) {
		return sendJsonSuccess(res, { id: vehicleId });
	}

	await prisma.vehicle.update({
		where: { id: vehicleId },
		data: { isActive: false },
	});

	return sendJsonSuccess(res, { id: vehicleId });
}

export {
	upsertVehicle,
	listVehiclesBySchool,
	getVehicleById,
	uploadVehiclePhoto,
	updateVehicle,
	deleteVehicle,
};
