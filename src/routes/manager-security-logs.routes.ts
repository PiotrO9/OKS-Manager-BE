import { Router, type Request, type Response } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { asyncHandler } from '../lib/http/asyncHandler';
import { requireUser } from '../lib/http/requireUser';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';
import { parseRequestPart } from '../controllers/requestParsing';
import {
	securityLogDetailParamsSchema,
	securityLogDetailQuerySchema,
	securityLogListQuerySchema,
	securityLogOptionsQuerySchema,
} from '../schemas/security-log.schemas';
import {
	getManagerSecurityLog,
	listManagerSecurityLogFilterOptions,
	listManagerSecurityLogs,
} from '../services/security-events/list';

export function createManagerSecurityLogsRouter() {
	const router = Router();
	router.use(
		'/security-logs',
		(_req, res, next) => {
			res.setHeader('Cache-Control', 'private, no-store');
			next();
		},
		authMiddleware,
		requireRole('MANAGER'),
	);
	router.get(
		'/security-logs',
		asyncHandler(async (req: Request, res: Response) => {
			const user = requireUser(req);
			const query = parseRequestPart(
				securityLogListQuerySchema,
				req.query,
				'query',
			);
			return sendJsonSuccess(
				res,
				await listManagerSecurityLogs(user.id, query),
			);
		}),
	);
	router.get(
		'/security-logs/filter-options',
		asyncHandler(async (req: Request, res: Response) => {
			const user = requireUser(req);
			const query = parseRequestPart(
				securityLogOptionsQuerySchema,
				req.query,
				'query',
			);
			return sendJsonSuccess(
				res,
				await listManagerSecurityLogFilterOptions(user.id, query),
			);
		}),
	);
	router.get(
		'/security-logs/:eventId',
		asyncHandler(async (req: Request, res: Response) => {
			const user = requireUser(req);
			const { schoolId } = parseRequestPart(
				securityLogDetailQuerySchema,
				req.query,
				'query',
			);
			const { eventId } = parseRequestPart(
				securityLogDetailParamsSchema,
				req.params,
				'params',
			);
			return sendJsonSuccess(
				res,
				await getManagerSecurityLog(user.id, schoolId, eventId),
			);
		}),
	);
	return router;
}
