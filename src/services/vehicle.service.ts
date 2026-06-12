import { randomUUID } from 'crypto';
import {
	EventType,
	type DrivingSchool,
	LessonStatus,
	type Vehicle,
	type VehicleAvailabilityStatus,
} from '@prisma/client';
import { AppError } from '../lib/http/AppError';
import { getPrisma } from '../lib/prisma';
import { getSupabaseAdminClient } from '../lib/supabaseAdmin';
import {
	ALLOWED_STANDARD_IMAGE_MIMES,
	extractPublicStorageObjectPath,
	fileExtensionFromMime,
	removeStorageObjectBestEffort,
	type UploadedPhotoFile,
} from '../lib/supabaseStorage';
import { parseUuidParam } from '../lib/validation/uuid';
import {
	type OptionalVehicleFields,
	type OptionalVehiclePatch,
	parseVehicleWriteBody,
} from '../schemas/vehicle.schemas';

const prisma = getPrisma();

const VEHICLE_IMAGES_BUCKET =
	process.env.SUPABASE_VEHICLE_IMAGES_BUCKET ?? 'vehicle-images';

const ALLOWED_VEHICLE_PHOTO_MIMES = ALLOWED_STANDARD_IMAGE_MIMES;

export type { UploadedPhotoFile };

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
	availabilityStatus: VehicleAvailabilityStatus;
	createdAt: Date;
	school: {
		ownerId: string;
		deletedAt: Date | null;
		defaultVehicleId: string | null;
	};
};

type VehicleResponse = Omit<Vehicle, 'availabilityStatus'> & {
	status: VehicleAvailabilityStatus;
	isDefault?: boolean;
};

function vehicleToResponse(
	vehicle: Vehicle,
	isDefault?: boolean,
): VehicleResponse {
	const { availabilityStatus, ...rest } = vehicle;

	return {
		...rest,
		status: availabilityStatus,
		...(isDefault === undefined ? {} : { isDefault }),
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
			availabilityStatus: true,
			createdAt: true,
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

async function listVehiclesBySchoolForUser(
	userId: string,
	schoolId: string,
	timeRange?: { start: Date; end: Date },
): Promise<{
	vehicles: VehicleResponse[];
	defaultVehicleId: string | null;
}> {
	const school = await getSchoolOwnedByUser(userId, schoolId);
	if (!school) {
		throw AppError.forbidden('Forbidden');
	}

	const vehicles = await prisma.vehicle.findMany({
		where: { schoolId, isActive: true },
		orderBy: { createdAt: 'asc' },
	});

	const defaultVehicleId = school.defaultVehicleId ?? null;
	let vehiclesWithDefault = vehicles.map((v) => ({
		...v,
		isDefault: defaultVehicleId !== null && v.id === defaultVehicleId,
	}));

	if (timeRange) {
		const { start, end } = timeRange;
		const ids = vehiclesWithDefault.map((v) => v.id);
		if (ids.length > 0) {
			const [busyLessons, busyEvents] = await Promise.all([
				prisma.lesson.findMany({
					where: {
						vehicleId: { in: ids },
						status: { not: LessonStatus.CANCELLED },
						startTime: { lt: end },
						endTime: { gt: start },
					},
					select: { vehicleId: true },
				}),
				prisma.instructorEvent.findMany({
					where: {
						vehicleId: { in: ids },
						type: EventType.DRIVE,
						isActive: true,
						startTime: { lt: end },
						endTime: { gt: start },
					},
					select: { vehicleId: true },
				}),
			]);
			const busy = new Set<string>();
			for (const row of busyLessons) {
				if (row.vehicleId) {
					busy.add(row.vehicleId);
				}
			}
			for (const row of busyEvents) {
				if (row.vehicleId) {
					busy.add(row.vehicleId);
				}
			}
			vehiclesWithDefault = vehiclesWithDefault.filter(
				(v) => !busy.has(v.id),
			);
		}
	}

	return {
		vehicles: vehiclesWithDefault.map(({ isDefault, ...vehicle }) =>
			vehicleToResponse(vehicle, isDefault),
		),
		defaultVehicleId,
	};
}

async function getVehicleByIdForUser(userId: string, vehicleId: string) {
	const loaded = await loadVehicleWithSchoolForAccess(vehicleId);
	if (loaded.kind === 'missing') {
		throw AppError.notFound('Vehicle not found');
	}
	if (!userMayAccessVehicleSchool(userId, loaded.row.school)) {
		throw AppError.forbidden('Forbidden');
	}

	const { school, ...vehicle } = loaded.row;

	return vehicleToResponse(
		vehicle,
		school.defaultVehicleId !== null &&
			school.defaultVehicleId === vehicle.id,
	);
}

async function uploadVehiclePhotoForUser(
	userId: string,
	vehicleId: string,
	file: UploadedPhotoFile,
): Promise<{ photoUrl: string | null }> {
	if (!file?.buffer) {
		throw AppError.badRequest('file is required (multipart field: file)');
	}
	if (!ALLOWED_VEHICLE_PHOTO_MIMES.has(file.mimetype)) {
		throw AppError.badRequest(
			'file must be image/jpeg, image/png, or image/webp',
		);
	}

	const ext = fileExtensionFromMime(file.mimetype);
	if (!ext) {
		throw AppError.badRequest('Unsupported image type');
	}

	const loaded = await loadVehicleWithSchoolForAccess(vehicleId);
	if (loaded.kind === 'missing') {
		throw AppError.notFound('Vehicle not found');
	}
	if (!userMayAccessVehicleSchool(userId, loaded.row.school)) {
		throw AppError.forbidden('Forbidden');
	}

	const schoolId = loaded.row.schoolId;
	const objectPath = `${schoolId}/${vehicleId}/${randomUUID()}.${ext}`;

	let admin;
	try {
		admin = getSupabaseAdminClient();
	} catch {
		throw AppError.internal('Storage is not configured');
	}

	const { data: uploaded, error: uploadError } = await admin.storage
		.from(VEHICLE_IMAGES_BUCKET)
		.upload(objectPath, file.buffer, {
			contentType: file.mimetype,
			upsert: true,
		});

	if (uploadError || !uploaded?.path) {
		throw AppError.badGateway('Upload failed');
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

	return { photoUrl: updated.photoUrl };
}

async function upsertVehicleForUser(
	userId: string,
	body: Record<string, unknown>,
): Promise<{ status: 200 | 201; vehicle: VehicleResponse }> {
	const idParse = parseUuidParam(body.id);
	if (idParse === 'invalid') {
		throw AppError.badRequest('Invalid vehicle id');
	}

	if (idParse === null) {
		const payload = parseVehicleWriteBody(body, 'create');
		if (!payload.ok) {
			throw AppError.badRequest(payload.error);
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
			throw AppError.badRequest('schoolId is required');
		}
		if (schoolIdParse === 'invalid') {
			throw AppError.badRequest('Invalid schoolId');
		}

		const schoolRow = await getSchoolOwnedByUser(userId, schoolIdParse);
		if (!schoolRow) {
			throw AppError.forbidden('Forbidden');
		}

		const schoolId = schoolIdParse;

		const duplicate = await prisma.vehicle.findFirst({
			where: { schoolId, registrationNumber },
		});
		if (duplicate) {
			throw AppError.conflict(
				'registrationNumber already exists for this driving school',
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

		return { status: 201, vehicle: vehicleToResponse(created) };
	}

	const patchPayload = parseVehicleWriteBody(body, 'patch');
	if (!patchPayload.ok) {
		throw AppError.badRequest(patchPayload.error);
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
		throw AppError.notFound('Vehicle not found');
	}

	const school = await getSchoolOwnedByUser(userId, existing.schoolId);
	if (!school) {
		throw AppError.forbidden('Forbidden');
	}

	if (!existing.isActive) {
		throw AppError.notFound('Vehicle not found');
	}

	const duplicate = await prisma.vehicle.findFirst({
		where: {
			schoolId: existing.schoolId,
			registrationNumber,
			id: { not: idParse },
		},
	});
	if (duplicate) {
		throw AppError.conflict(
			'registrationNumber already exists for this driving school',
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

	return { status: 200, vehicle: vehicleToResponse(updated) };
}

async function updateVehicleForUser(
	userId: string,
	vehicleId: string,
	body: Record<string, unknown>,
): Promise<VehicleResponse> {
	const loaded = await loadVehicleForOwner(userId, vehicleId);
	if (!loaded.ok) {
		if (loaded.notFound) {
			throw AppError.notFound('Vehicle not found');
		}
		throw AppError.forbidden('Forbidden');
	}

	if (!loaded.vehicle.isActive) {
		throw AppError.notFound('Vehicle not found');
	}

	const payload = parseVehicleWriteBody(body, 'patch');
	if (!payload.ok) {
		throw AppError.badRequest(payload.error);
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
		throw AppError.conflict(
			'registrationNumber already exists for this driving school',
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

	return vehicleToResponse(updated);
}

async function updateVehicleStatusForUser(
	userId: string,
	vehicleId: string,
	status: VehicleAvailabilityStatus,
): Promise<VehicleResponse> {
	const loaded = await loadVehicleForOwner(userId, vehicleId);
	if (!loaded.ok) {
		if (loaded.notFound) {
			throw AppError.notFound('Vehicle not found');
		}
		throw AppError.forbidden('Forbidden');
	}

	if (!loaded.vehicle.isActive) {
		throw AppError.notFound('Vehicle not found');
	}

	const updated = await prisma.vehicle.update({
		where: { id: vehicleId },
		data: { availabilityStatus: status },
	});

	return vehicleToResponse(updated);
}

async function deleteVehicleForUser(
	userId: string,
	vehicleId: string,
): Promise<{ id: string }> {
	const loaded = await loadVehicleForOwner(userId, vehicleId);
	if (!loaded.ok) {
		if (loaded.notFound) {
			throw AppError.notFound('Vehicle not found');
		}
		throw AppError.forbidden('Forbidden');
	}

	if (!loaded.vehicle.isActive) {
		return { id: vehicleId };
	}

	await prisma.vehicle.update({
		where: { id: vehicleId },
		data: { isActive: false },
	});

	return { id: vehicleId };
}

export const vehicleService = {
	listVehiclesBySchoolForUser,
	getVehicleByIdForUser,
	uploadVehiclePhotoForUser,
	upsertVehicleForUser,
	updateVehicleForUser,
	updateVehicleStatusForUser,
	deleteVehicleForUser,
};
