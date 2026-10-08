import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '../lib/http/AppError';

const CONFIRMATION_MAX_AGE_MS = 10 * 60 * 1000;

export type AuditOperation =
	| { kind: 'clear'; level: 'managers' | 'schools' | 'instructors' | 'full' }
	| { kind: 'fixture'; fixture: string };

function databaseTargetFingerprint(): string {
	const rawUrl = process.env.DATABASE_URL;
	if (!rawUrl) {
		throw AppError.forbidden('Audit database target is not configured');
	}
	try {
		const url = new URL(rawUrl);
		if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
			throw new Error('Unsupported database protocol');
		}
		const target = [
			url.hostname.toLowerCase(),
			url.port || '5432',
			decodeURIComponent(url.username),
			decodeURIComponent(url.pathname),
			url.searchParams.get('schema') || 'public',
		].join('|');
		return createHash('sha256').update(target).digest('hex');
	} catch {
		throw AppError.forbidden('Audit database target is invalid');
	}
}

function confirmationSecret(): string {
	const secret = process.env.AUDIT_RESET_CONFIRM_SECRET;
	if (!secret || secret.length < 32) {
		throw AppError.forbidden('Audit confirmation secret is not configured');
	}
	return secret;
}

export function requireAuditPreviewEnabled(): string {
	if (process.env.NODE_ENV === 'production') {
		throw AppError.forbidden('Audit reset is unavailable in production');
	}
	if (process.env.ALLOW_DB_RESET !== 'true') {
		throw AppError.forbidden('Database reset is disabled');
	}
	confirmationSecret();
	return databaseTargetFingerprint();
}

export function requireAuditExecutionEnabled(
	operation: AuditOperation,
): string {
	const fingerprint = requireAuditPreviewEnabled();
	if (process.env.AUDIT_RESET_TARGET_FINGERPRINT !== fingerprint) {
		throw AppError.forbidden('Audit database target is not approved');
	}
	if (
		operation.kind === 'fixture' ||
		(operation.kind === 'clear' && operation.level === 'full')
	) {
		if (process.env.ALLOW_DB_FULL_RESET !== 'true') {
			throw AppError.forbidden('Full database reset is disabled');
		}
	}
	return fingerprint;
}

type ConfirmationPayload = {
	operation: AuditOperation;
	target: string;
	previewHash: string;
	expiresAt: number;
};

function previewHash(preview: unknown): string {
	return createHash('sha256').update(JSON.stringify(preview)).digest('hex');
}

export function issueAuditConfirmation(
	operation: AuditOperation,
	target: string,
	preview: unknown,
	now = Date.now(),
): { confirmation: string; expiresAt: string } {
	const payload: ConfirmationPayload = {
		operation,
		target,
		previewHash: previewHash(preview),
		expiresAt: now + CONFIRMATION_MAX_AGE_MS,
	};
	const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
	const signature = createHmac('sha256', confirmationSecret())
		.update(encoded)
		.digest('base64url');
	return {
		confirmation: `${encoded}.${signature}`,
		expiresAt: new Date(payload.expiresAt).toISOString(),
	};
}

export function verifyAuditConfirmation(
	confirmation: string,
	operation: AuditOperation,
	target: string,
	preview: unknown,
	now = Date.now(),
): void {
	const [encoded, signature, extra] = confirmation.split('.');
	if (!encoded || !signature || extra) {
		throw AppError.badRequest('Invalid audit confirmation');
	}
	const expectedSignature = createHmac('sha256', confirmationSecret())
		.update(encoded)
		.digest();
	let providedSignature: Buffer;
	try {
		providedSignature = Buffer.from(signature, 'base64url');
	} catch {
		throw AppError.badRequest('Invalid audit confirmation');
	}
	if (
		providedSignature.length !== expectedSignature.length ||
		!timingSafeEqual(providedSignature, expectedSignature)
	) {
		throw AppError.badRequest('Invalid audit confirmation');
	}
	let payload: ConfirmationPayload;
	try {
		payload = JSON.parse(
			Buffer.from(encoded, 'base64url').toString('utf8'),
		);
	} catch {
		throw AppError.badRequest('Invalid audit confirmation');
	}
	if (
		payload.expiresAt < now ||
		payload.target !== target ||
		payload.previewHash !== previewHash(preview) ||
		JSON.stringify(payload.operation) !== JSON.stringify(operation)
	) {
		throw AppError.conflict('Audit preview has expired or data changed');
	}
}
