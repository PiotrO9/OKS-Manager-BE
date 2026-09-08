type LogContext = Record<string, unknown>;
type LogInput = Error | LogContext | unknown;

const SENSITIVE_KEYS = [
	'authorization',
	'cookie',
	'cookies',
	'password',
	'refreshToken',
	'refresh_token',
	'token',
	'accessToken',
	'access_token',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function shouldRedactKey(key: string): boolean {
	const normalized = key.toLowerCase();
	return SENSITIVE_KEYS.some((sensitiveKey) =>
		normalized.includes(sensitiveKey.toLowerCase()),
	);
}

function sanitizeLogValue(value: unknown): unknown {
	if (value instanceof Error) {
		return {
			name: value.name,
			message: value.message,
			stack: value.stack,
		};
	}

	if (Array.isArray(value)) {
		return value.map((item) => sanitizeLogValue(item));
	}

	if (!isRecord(value)) {
		return value;
	}

	return Object.fromEntries(
		Object.entries(value).map(([key, entryValue]) => [
			key,
			shouldRedactKey(key) ? '[REDACTED]' : sanitizeLogValue(entryValue),
		]),
	);
}

function logInfo(message: string, context?: LogInput): void {
	if (context === undefined) {
		console.info(message);
		return;
	}
	console.info(message, sanitizeLogValue(context));
}

function logWarn(message: string, context?: LogInput): void {
	if (context === undefined) {
		console.warn(message);
		return;
	}
	console.warn(message, sanitizeLogValue(context));
}

function logError(message: string, context?: LogInput): void {
	if (context === undefined) {
		console.error(message);
		return;
	}
	console.error(message, sanitizeLogValue(context));
}

const logger = {
	error: logError,
	info: logInfo,
	warn: logWarn,
};

export { logger, sanitizeLogValue };
export type { LogContext };
