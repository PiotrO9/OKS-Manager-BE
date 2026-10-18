import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { sendJsonError } from '../apiResponse';
import { logger } from '../logger';
import {
	actorSchoolScopes,
	recordRequestSecurityEvent,
	verifiedSchoolScope,
} from '../securityEventContext';
import { AppError } from './AppError';
import { ScheduleDomainError } from './ScheduleDomainError';

export const errorRequestHandler: ErrorRequestHandler = async (
	err,
	req,
	res,
	next,
) => {
	if (res.headersSent) {
		next(err);
		return;
	}

	if (err instanceof AppError) {
		if (err.statusCode === 403 || err.securityAudit) {
			const audit = err.securityAudit;
			const schoolScopes = audit?.schoolId
				? await verifiedSchoolScope(req, audit.schoolId, {
						userId: audit.targetUserId,
						displayName: audit.targetDisplayName,
					})
				: await actorSchoolScopes(req);
			await recordRequestSecurityEvent(req, {
				type: 'ACCESS_DENIED',
				actorUserId: req.user?.id,
				actorRole: req.user?.role,
				actorDisplayName: req.user
					? `${req.user.firstName} ${req.user.lastName}`.trim()
					: undefined,
				targetUserId: audit?.targetUserId,
				targetDisplayName: audit?.targetDisplayName,
				resourceType: audit?.resourceType,
				resourceId: audit?.resourceId,
				reasonCode: audit?.reasonCode ?? 'SERVICE_FORBIDDEN',
				eventPhase: 'access_decision',
				httpStatus: err.statusCode,
				schoolScopes,
			});
		}
		sendJsonError(
			res,
			err.message,
			err.statusCode,
			err instanceof ScheduleDomainError
				? { code: err.reason, details: err.details }
				: err.code
					? { code: err.code }
					: undefined,
		);
		return;
	}

	if (err instanceof ZodError) {
		const message = err.issues[0]?.message ?? 'Validation error';
		sendJsonError(res, message, 400);
		return;
	}

	logger.error('Unhandled error', {
		error: err,
		requestId: req.requestId,
	});
	sendJsonError(res, 'Internal server error', 500);
};
