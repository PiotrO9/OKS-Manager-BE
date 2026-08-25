import { Router } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { AppError } from '../lib/http/AppError';
import { asyncHandler } from '../lib/http/asyncHandler';
import { getPrisma } from '../lib/prisma';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';
import { resetAndSeedDemoDatabase } from '../services/devResetSeed.service';

function requireResetAndSeedEnabled() {
	if (process.env.ALLOW_DB_RESET !== 'true') {
		throw AppError.forbidden('Database reset is disabled');
	}
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

			const result = await resetAndSeedDemoDatabase(getPrisma());
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

export { createDevRouter, requireResetAndSeedEnabled };
