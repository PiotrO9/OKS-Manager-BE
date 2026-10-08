import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { sendJsonSuccess } from '../lib/apiResponse';
import { asyncHandler } from '../lib/http/asyncHandler';
import { requireUser } from '../lib/http/requireUser';
import { authMiddleware, requireRole } from '../middleware/auth.middleware';
import { parseRequestPart } from '../controllers/requestParsing';
import {
	archiveManagerAccount,
	changeManagerAccountEmail,
	getManagerAccount,
	listManagerAccounts,
	reconcileManagerAccountEmail,
	sendManagerAccountPasswordReset,
	setManagerAccountActive,
	updateManagerAccountProfile,
} from '../services/managerAccounts.service';

const schoolQuery = z.object({ schoolId: z.string().uuid() });
const targetParams = z.object({ userId: z.string().uuid() });
const profileBody = z.object({
	firstName: z.string().trim().min(1).max(100),
	lastName: z.string().trim().min(1).max(100),
	phone: z.string().trim().max(40).nullable(),
});
const emailBody = z.object({
	email: z
		.string()
		.trim()
		.email()
		.max(320)
		.transform((email) => email.toLowerCase()),
});
const statusBody = z.object({ isActive: z.boolean() });

function scope(req: Request) {
	const actor = requireUser(req);
	const { schoolId } = parseRequestPart(schoolQuery, req.query, 'query');
	const { userId } = parseRequestPart(targetParams, req.params, 'params');
	return { actorId: actor.id, schoolId, userId, requestId: req.requestId };
}

function createManagerAccountsRouter() {
	const router = Router();
	router.use(authMiddleware, requireRole('MANAGER'));
	router.get(
		'/accounts',
		asyncHandler(async (req: Request, res: Response) => {
			const actor = requireUser(req);
			const { schoolId } = parseRequestPart(
				schoolQuery,
				req.query,
				'query',
			);
			return sendJsonSuccess(
				res,
				await listManagerAccounts(actor.id, schoolId),
			);
		}),
	);
	router.get(
		'/accounts/:userId',
		asyncHandler(async (req, res) => {
			const { actorId, schoolId, userId } = scope(req);
			return sendJsonSuccess(
				res,
				await getManagerAccount(actorId, schoolId, userId),
			);
		}),
	);
	router.patch(
		'/accounts/:userId/profile',
		asyncHandler(async (req, res) => {
			const { actorId, schoolId, userId, requestId } = scope(req);
			const body = parseRequestPart(profileBody, req.body, 'body');
			return sendJsonSuccess(
				res,
				await updateManagerAccountProfile(
					actorId,
					schoolId,
					userId,
					body,
					requestId,
				),
			);
		}),
	);
	router.patch(
		'/accounts/:userId/email',
		asyncHandler(async (req, res) => {
			const { actorId, schoolId, userId, requestId } = scope(req);
			const { email } = parseRequestPart(emailBody, req.body, 'body');
			return sendJsonSuccess(
				res,
				await changeManagerAccountEmail(
					actorId,
					schoolId,
					userId,
					email,
					requestId,
				),
			);
		}),
	);
	router.post(
		'/accounts/:userId/email/reconcile',
		asyncHandler(async (req, res) => {
			const { actorId, schoolId, userId } = scope(req);
			return sendJsonSuccess(
				res,
				await reconcileManagerAccountEmail(actorId, schoolId, userId),
			);
		}),
	);
	router.patch(
		'/accounts/:userId/status',
		asyncHandler(async (req, res) => {
			const { actorId, schoolId, userId, requestId } = scope(req);
			const { isActive } = parseRequestPart(statusBody, req.body, 'body');
			return sendJsonSuccess(
				res,
				await setManagerAccountActive(
					actorId,
					schoolId,
					userId,
					isActive,
					requestId,
				),
			);
		}),
	);
	router.post(
		'/accounts/:userId/archive',
		asyncHandler(async (req, res) => {
			const { actorId, schoolId, userId, requestId } = scope(req);
			return sendJsonSuccess(
				res,
				await archiveManagerAccount(
					actorId,
					schoolId,
					userId,
					requestId,
				),
			);
		}),
	);
	router.post(
		'/accounts/:userId/password-reset',
		asyncHandler(async (req, res) => {
			const { actorId, schoolId, userId, requestId } = scope(req);
			return sendJsonSuccess(
				res,
				await sendManagerAccountPasswordReset(
					actorId,
					schoolId,
					userId,
					requestId,
				),
			);
		}),
	);
	return router;
}

export { createManagerAccountsRouter };
