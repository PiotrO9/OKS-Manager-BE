export class AppError extends Error {
	readonly statusCode: number;
	code?: string;
	securityAudit?: {
		reasonCode: string;
		schoolId?: string;
		targetUserId?: string;
		targetDisplayName?: string;
		resourceType?: string;
		resourceId?: string;
	};

	constructor(statusCode: number, message: string) {
		super(message);
		this.name = 'AppError';
		this.statusCode = statusCode;
	}

	withSecurityAudit(context: NonNullable<AppError['securityAudit']>): this {
		this.securityAudit = context;
		return this;
	}

	withCode(code: string): this {
		this.code = code;
		return this;
	}

	static badRequest(message: string): AppError {
		return new AppError(400, message);
	}

	static unauthorized(message: string): AppError {
		return new AppError(401, message);
	}

	static forbidden(message: string): AppError {
		return new AppError(403, message);
	}

	static notFound(message: string): AppError {
		return new AppError(404, message);
	}

	static conflict(message: string): AppError {
		return new AppError(409, message);
	}

	static unprocessableEntity(message: string): AppError {
		return new AppError(422, message);
	}

	static internal(message: string): AppError {
		return new AppError(500, message);
	}

	static badGateway(message: string): AppError {
		return new AppError(502, message);
	}
}
