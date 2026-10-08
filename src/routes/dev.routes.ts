import { Router } from 'express';
import { Prisma, type PrismaClient } from '@prisma/client';
import { parseRequestPart } from '../controllers/requestParsing';
import { sendJsonSuccess } from '../lib/apiResponse';
import { AppError } from '../lib/http/AppError';
import { asyncHandler } from '../lib/http/asyncHandler';
import { getPrisma } from '../lib/prisma';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';
import {
	auditExecuteBodySchema,
	auditPreviewBodySchema,
	devResetAndSeedBodySchema,
	type AuditExecuteBody,
	type AuditPreviewBody,
	type DevResetAndSeedBody,
} from '../schemas/dev.schemas';
import { resetAndSeedDemoDatabase } from '../services/devResetSeed.service';
import {
	getAuditFixtureAccounts,
	restoreAuditAdmin,
	seedAuditFixture,
	type AuditFixtureResult,
} from '../services/auditFixtures.service';
import {
	AuditResetConflictError,
	AuditResetUnavailableError,
	previewAuditReset,
	resetAuditDatabase,
} from '../services/auditReset.service';
import {
	issueAuditConfirmation,
	requireAuditExecutionEnabled,
	requireAuditPreviewEnabled,
	verifyAuditConfirmation,
	type AuditOperation,
} from '../services/auditResetGuard';
import { ensureAuthUsers } from '../services/devResetSeed/authUsers';
import { ADMIN_ACCOUNT } from '../services/devResetSeed/constants';

function requireResetAndSeedEnabled() {
	requireAuditExecutionEnabled({ kind: 'clear', level: 'full' });
}

function requireLegacySeedConfirmation(value: string | undefined) {
	if (value !== 'WIPE AUDIT DATABASE') {
		throw AppError.badRequest('Full replacement confirmation is required');
	}
}

function parseResetAndSeedBody(body: unknown): DevResetAndSeedBody {
	return parseRequestPart(devResetAndSeedBodySchema, body, 'body');
}

function parseAuditPreviewBody(body: unknown): AuditPreviewBody {
	return parseRequestPart(auditPreviewBodySchema, body, 'body');
}

function parseAuditExecuteBody(body: unknown): AuditExecuteBody {
	return parseRequestPart(auditExecuteBodySchema, body, 'body');
}

function requiresFullConfirmation(operation: AuditOperation): boolean {
	return (
		operation.kind === 'fixture' ||
		(operation.kind === 'clear' && operation.level === 'full')
	);
}

async function previewOperation(
	prisma: PrismaClient,
	operation: AuditOperation,
) {
	return previewAuditReset(
		prisma,
		operation.kind === 'clear' ? operation.level : 'full',
	);
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
			requireLegacySeedConfirmation(
				req.header('x-audit-full-confirmation'),
			);
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

	router.post(
		'/audit/preview',
		authMiddleware,
		requireRole('ADMIN'),
		asyncHandler(async (req, res) => {
			const { operation } = parseAuditPreviewBody(req.body);
			const targetFingerprint = requireAuditPreviewEnabled();
			const preview = await previewOperation(getPrisma(), operation);
			const confirmation = issueAuditConfirmation(
				operation,
				targetFingerprint,
				preview,
			);
			return sendJsonSuccess(res, {
				operation,
				preview,
				targetFingerprint,
				...confirmation,
			});
		}),
	);

	router.post(
		'/audit/execute',
		authMiddleware,
		requireRole('ADMIN'),
		asyncHandler(async (req, res) => {
			const { operation, confirmation, fullConfirmation } =
				parseAuditExecuteBody(req.body);
			const targetFingerprint = requireAuditExecutionEnabled(operation);
			if (
				requiresFullConfirmation(operation) &&
				fullConfirmation !== 'WIPE AUDIT DATABASE'
			) {
				throw AppError.badRequest(
					'Full replacement confirmation is required',
				);
			}
			const prisma = getPrisma();
			const preview = await previewOperation(prisma, operation);
			verifyAuditConfirmation(
				confirmation,
				operation,
				targetFingerprint,
				preview,
			);
			const startedAt = Date.now();
			let fixtureResult: AuditFixtureResult | undefined;
			let resetResult: Awaited<ReturnType<typeof resetAuditDatabase>>;
			try {
				if (operation.kind === 'fixture') {
					const authIds = await ensureAuthUsers(
						getAuditFixtureAccounts(operation.fixture),
					);
					resetResult = await resetAuditDatabase(prisma, 'full', {
						expectedPreview: preview,
						restoreAfterFull: async (
							tx: Prisma.TransactionClient,
						) => {
							fixtureResult = await seedAuditFixture(
								tx,
								operation.fixture,
								authIds,
							);
						},
					});
				} else if (operation.level === 'full') {
					const authIds = await ensureAuthUsers([ADMIN_ACCOUNT]);
					resetResult = await resetAuditDatabase(prisma, 'full', {
						expectedPreview: preview,
						restoreAfterFull: async (
							tx: Prisma.TransactionClient,
						) => {
							await restoreAuditAdmin(tx, authIds);
						},
					});
				} else {
					resetResult = await resetAuditDatabase(
						prisma,
						operation.level,
						{
							expectedPreview: preview,
						},
					);
				}
			} catch (error) {
				if (error instanceof AuditResetConflictError) {
					throw AppError.conflict(error.message);
				}
				if (error instanceof AuditResetUnavailableError) {
					throw AppError.unprocessableEntity(error.message);
				}
				throw error;
			}
			return sendJsonSuccess(res, {
				operation,
				reset: resetResult,
				fixture: fixtureResult,
				auth:
					operation.kind === 'fixture' || operation.level === 'full'
						? 'Specified test accounts upserted; other Auth accounts retained'
						: 'Untouched',
				storage: 'Untouched',
				durationMs: Date.now() - startedAt,
			});
		}),
	);

	return router;
}

export {
	createDevRouter,
	parseAuditExecuteBody,
	parseAuditPreviewBody,
	parseResetAndSeedBody,
	requireLegacySeedConfirmation,
	requireResetAndSeedEnabled,
};
