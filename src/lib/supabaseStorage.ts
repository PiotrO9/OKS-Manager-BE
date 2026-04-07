import { getSupabaseAdminClient } from './supabaseAdmin';

/** Dozwolone typy MIME dla zdjęć (pojazdy, avatary). */
export const ALLOWED_STANDARD_IMAGE_MIMES = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
]);

export type UploadedPhotoFile = { buffer: Buffer; mimetype: string };

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
