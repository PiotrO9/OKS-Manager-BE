import { describe, expect, it } from 'vitest';
import {
	assertStandardImageMagicBytes,
	detectImageMimeFromMagicBytes,
} from '../../lib/supabaseStorage';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const webp = Buffer.from('RIFFxxxxWEBPVP8 ', 'ascii');

describe('supabaseStorage image magic bytes', () => {
	it('detects supported image MIME types from magic bytes', () => {
		expect(detectImageMimeFromMagicBytes(jpeg)).toBe('image/jpeg');
		expect(detectImageMimeFromMagicBytes(png)).toBe('image/png');
		expect(detectImageMimeFromMagicBytes(webp)).toBe('image/webp');
	});

	it('rejects unknown image content', () => {
		expect(() =>
			assertStandardImageMagicBytes({
				buffer: Buffer.from('not an image'),
				mimetype: 'image/png',
			}),
		).toThrow('Unsupported image content');
	});

	it('rejects MIME mismatch between header and upload metadata', () => {
		expect(() =>
			assertStandardImageMagicBytes({
				buffer: png,
				mimetype: 'image/jpeg',
			}),
		).toThrow('Image content does not match declared MIME type');
	});

	it('accepts matching JPEG, PNG, and WebP uploads', () => {
		expect(() =>
			assertStandardImageMagicBytes({
				buffer: jpeg,
				mimetype: 'image/jpeg',
			}),
		).not.toThrow();
		expect(() =>
			assertStandardImageMagicBytes({
				buffer: png,
				mimetype: 'image/png',
			}),
		).not.toThrow();
		expect(() =>
			assertStandardImageMagicBytes({
				buffer: webp,
				mimetype: 'image/webp',
			}),
		).not.toThrow();
	});
});
