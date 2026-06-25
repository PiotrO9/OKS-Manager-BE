import { Router } from 'express';
import { sendJsonSuccess } from '../lib/apiResponse';
import { AppError } from '../lib/http/AppError';
import { asyncHandler } from '../lib/http/asyncHandler';
import { getPrisma } from '../lib/prisma';
import { resetAndSeedDemoDatabase } from '../services/devResetSeed.service';

function requireManualDevReset(reqSecret: unknown) {
	if (process.env.NODE_ENV !== 'development') {
		throw AppError.notFound('Not found');
	}

	if (process.env.ALLOW_DB_RESET !== 'true') {
		throw AppError.forbidden('Database reset is disabled');
	}

	const expectedSecret = process.env.DEV_DB_RESET_SECRET;
	if (!expectedSecret) {
		throw AppError.forbidden('DEV_DB_RESET_SECRET is not configured');
	}

	if (typeof reqSecret !== 'string' || reqSecret !== expectedSecret) {
		throw AppError.forbidden('Invalid reset secret');
	}
}

function createDevRouter() {
	const router = Router();

	router.post(
		'/reset-and-seed',
		asyncHandler(async (req, res) => {
			const startedAtMs = Date.now();
			requireManualDevReset(req.header('x-dev-reset-secret'));

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

export { createDevRouter };
