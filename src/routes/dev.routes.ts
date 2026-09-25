import { Router } from 'express';
import { parseRequestPart } from '../controllers/requestParsing';
import { sendJsonSuccess } from '../lib/apiResponse';
import { AppError } from '../lib/http/AppError';
import { asyncHandler } from '../lib/http/asyncHandler';
import { getPrisma } from '../lib/prisma';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';
import {
	devResetAndSeedBodySchema,
	type DevResetAndSeedBody,
} from '../schemas/dev.schemas';
import { resetAndSeedDemoDatabase } from '../services/devResetSeed.service';

function requireResetAndSeedEnabled() {
	if (process.env.ALLOW_DB_RESET !== 'true') {
		throw AppError.forbidden('Database reset is disabled');
	}
}

function parseResetAndSeedBody(body: unknown): DevResetAndSeedBody {
	return parseRequestPart(devResetAndSeedBodySchema, body, 'body');
}

function createDevRouter() {
	const router = Router();

	router.post(
		'/reset-and-seed',
		authMiddleware,
		requireRole('ADMIN'),
		asyncHandler(async (req, res) => {
			const startedAtMs = Date.now();
			requireResetAndSeedEnabled();
			const seedOptions = parseResetAndSeedBody(req.body);

			const result = await resetAndSeedDemoDatabase(
				getPrisma(),
				seedOptions,
			);
			const finishedAtMs = Date.now();
			const durationMs = finishedAtMs - startedAtMs;

			return sendJsonSuccess(res, {
				message: 'Database reset and demo seed completed',
				timing: {
					startedAt: new Date(startedAtMs).toISOString(),
					finishedAt: new Date(finishedAtMs).toISOString(),
					durationMs,
					durationSeconds: Number((durationMs / 1000).toFixed(2)),
				},
				...result,
			});
		}),
	);

	return router;
}

export { createDevRouter, parseResetAndSeedBody, requireResetAndSeedEnabled };
