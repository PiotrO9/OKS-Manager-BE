import { randomUUID } from 'crypto';
import { AppError } from '../../lib/http/AppError';
import { getPrisma } from '../../lib/prisma';
import { getSupabaseAdminClient } from '../../lib/supabaseAdmin';
import {
	ALLOWED_STANDARD_IMAGE_MIMES,
	assertStandardImageMagicBytes,
	extractPublicStorageObjectPath,
	fileExtensionFromMime,
	removeStorageObjectBestEffort,
	type UploadedPhotoFile,
} from '../../lib/supabaseStorage';
import {
	loadVehicleWithSchoolForAccess,
	userMayAccessVehicleSchool,
} from './access';

const prisma = getPrisma();

const VEHICLE_IMAGES_BUCKET =
	process.env.SUPABASE_VEHICLE_IMAGES_BUCKET ?? 'vehicle-images';

const ALLOWED_VEHICLE_PHOTO_MIMES = ALLOWED_STANDARD_IMAGE_MIMES;

export type { UploadedPhotoFile };

export async function uploadVehiclePhotoForUser(
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
	try {
		assertStandardImageMagicBytes(file);
	} catch {
		throw AppError.badRequest(
			'file content must match image/jpeg, image/png, or image/webp',
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
