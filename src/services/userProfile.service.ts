import { randomUUID } from 'crypto';
import type { Prisma } from '@prisma/client';
import { AppError } from '../lib/http/AppError';
import { getPrisma } from '../lib/prisma';
import { getSupabaseAdminClient } from '../lib/supabaseAdmin';
import {
	ALLOWED_STANDARD_IMAGE_MIMES,
	assertStandardImageMagicBytes,
	extractPublicStorageObjectPath,
	fileExtensionFromMime,
	removeStorageObjectBestEffort,
	type UploadedPhotoFile,
} from '../lib/supabaseStorage';

export type { UploadedPhotoFile } from '../lib/supabaseStorage';

const prisma = getPrisma();

const AVATARS_BUCKET = process.env.SUPABASE_AVATARS_BUCKET ?? 'avatars';

const BIO_MAX_LENGTH = 2000;
const NAME_MAX_LENGTH = 100;

export type PatchProfileInput = {
	bio?: string | null;
	phone?: string | null;
	firstName?: string;
	lastName?: string;
};

function validateNameField(
	label: 'firstName' | 'lastName',
	raw: unknown,
): string {
	if (typeof raw !== 'string') {
		throw AppError.badRequest(`${label} must be a string`);
	}
	const t = raw.trim();
	if (t === '') {
		throw AppError.badRequest(`${label} must not be empty`);
	}
	if (t.length > NAME_MAX_LENGTH) {
		throw AppError.badRequest(
			`${label} too long (max ${NAME_MAX_LENGTH} characters)`,
		);
	}
	return t;
}

async function patchProfileForUser(
	userId: string,
	body: PatchProfileInput,
): Promise<void> {
	const hasBio = 'bio' in body;
	const hasPhone = 'phone' in body;
	const hasFirstName = 'firstName' in body;
	const hasLastName = 'lastName' in body;

	if (!hasBio && !hasPhone && !hasFirstName && !hasLastName) {
		throw AppError.badRequest(
			'At least one of bio, phone, firstName, lastName is required',
		);
	}

	if (hasBio && body.bio != null && typeof body.bio !== 'string') {
		throw AppError.badRequest('bio must be a string or null');
	}
	if (
		hasBio &&
		typeof body.bio === 'string' &&
		body.bio.length > BIO_MAX_LENGTH
	) {
		throw AppError.badRequest(
			`bio too long (max ${BIO_MAX_LENGTH} characters)`,
		);
	}

	if (hasPhone && body.phone != null && typeof body.phone !== 'string') {
		throw AppError.badRequest('phone must be a string or null');
	}

	const userUpdate: Prisma.UserUpdateInput = {};

	if (hasPhone) {
		let phoneVal: string | null;
		if (body.phone == null) {
			phoneVal = null;
		} else {
			const t = String(body.phone).trim();
			phoneVal = t === '' ? null : t;
		}
		userUpdate.phone = phoneVal;
	}

	if (hasFirstName) {
		userUpdate.firstName = validateNameField('firstName', body.firstName);
	}
	if (hasLastName) {
		userUpdate.lastName = validateNameField('lastName', body.lastName);
	}

	await prisma.$transaction(async (tx) => {
		if (Object.keys(userUpdate).length > 0) {
			await tx.user.update({
				where: { id: userId },
				data: userUpdate,
			});
		}

		if (hasBio) {
			const rawBio = body.bio;
			const bioVal =
				rawBio == null
					? null
					: String(rawBio).trim() === ''
						? null
						: String(rawBio).trim();

			await tx.userProfile.upsert({
				where: { userId },
				create: { userId, bio: bioVal },
				update: { bio: bioVal },
			});
		}
	});
}

async function uploadAvatarForUser(
	userId: string,
	file: UploadedPhotoFile,
): Promise<{ avatarUrl: string | null }> {
	if (!file?.buffer) {
		throw AppError.badRequest('file is required (multipart field: file)');
	}
	if (!ALLOWED_STANDARD_IMAGE_MIMES.has(file.mimetype)) {
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

	const existing = await prisma.userProfile.findUnique({
		where: { userId },
		select: { avatarUrl: true },
	});

	const objectPath = `${userId}/${randomUUID()}.${ext}`;

	let admin;
	try {
		admin = getSupabaseAdminClient();
	} catch {
		throw AppError.internal('Storage is not configured');
	}

	const { data: uploaded, error: uploadError } = await admin.storage
		.from(AVATARS_BUCKET)
		.upload(objectPath, file.buffer, {
			contentType: file.mimetype,
			upsert: true,
		});

	if (uploadError || !uploaded?.path) {
		throw AppError.badGateway('Upload failed');
	}

	const { data: pub } = admin.storage
		.from(AVATARS_BUCKET)
		.getPublicUrl(uploaded.path);
	const publicUrl = pub.publicUrl;

	const previousUrl = existing?.avatarUrl ?? null;

	await prisma.userProfile.upsert({
		where: { userId },
		create: { userId, avatarUrl: publicUrl },
		update: { avatarUrl: publicUrl },
	});

	if (previousUrl) {
		const oldPath = extractPublicStorageObjectPath(
			previousUrl,
			AVATARS_BUCKET,
		);
		if (oldPath && oldPath !== uploaded.path) {
			void removeStorageObjectBestEffort(oldPath, AVATARS_BUCKET);
		}
	}

	const row = await prisma.userProfile.findUnique({
		where: { userId },
		select: { avatarUrl: true },
	});

	return { avatarUrl: row?.avatarUrl ?? null };
}

export const userProfileService = {
	patchProfileForUser,
	uploadAvatarForUser,
};
