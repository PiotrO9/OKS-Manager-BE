import { Router } from 'express';
import { listAttentionItems } from '../controllers/manager-attention.controller';
import { asyncHandler } from '../lib/http/asyncHandler';
import { authMiddleware, requireMinRole } from '../middleware/auth.middleware';

function createManagerAttentionRouter() {
	const router = Router();

	router.get(
		'/attention-items',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(listAttentionItems),
	);

	return router;
}

export { createManagerAttentionRouter };
