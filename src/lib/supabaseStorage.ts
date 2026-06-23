import { getSupabaseAdminClient } from './supabaseAdmin';

/** Dozwolone typy MIME dla zdjęć (pojazdy, avatary). */
export const ALLOWED_STANDARD_IMAGE_MIMES = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
]);

export type UploadedPhotoFile = { buffer: Buffer; mimetype: string };

export function detectImageMimeFromMagicBytes(buffer: Buffer): string | null {
	if (
		buffer.length >= 3 &&
		buffer[0] === 0xff &&
		buffer[1] === 0xd8 &&
		buffer[2] === 0xff
	) {
		return 'image/jpeg';
	}

	if (
		buffer.length >= 8 &&
		buffer[0] === 0x89 &&
		buffer[1] === 0x50 &&
		buffer[2] === 0x4e &&
		buffer[3] === 0x47 &&
		buffer[4] === 0x0d &&
		buffer[5] === 0x0a &&
		buffer[6] === 0x1a &&
		buffer[7] === 0x0a
	) {
		return 'image/png';
	}

	if (
		buffer.length >= 12 &&
		buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
		buffer.subarray(8, 12).toString('ascii') === 'WEBP'
	) {
		return 'image/webp';
	}

	return null;
}

export function assertStandardImageMagicBytes(file: UploadedPhotoFile): void {
	const realMime = detectImageMimeFromMagicBytes(file.buffer);

	if (!realMime) {
		throw new Error('Unsupported image content');
	}

	if (realMime !== file.mimetype) {
		throw new Error('Image content does not match declared MIME type');
	}
}

export function fileExtensionFromMime(mime: string): string | null {
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

export function extractPublicStorageObjectPath(
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

export async function removeStorageObjectBestEffort(
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
