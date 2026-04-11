import { Router } from 'express';
import {
	computeAvailabilityHandler,
	deleteExceptionHandler,
	deleteWeeklyDayHandler,
	getExceptions,
	getSlotsHandler,
	getWeekly,
	putExceptionHandler,
	putWeeklyDay,
} from '../controllers/instructor-availability.controller';
import { asyncHandler } from '../lib/http/asyncHandler';
import { authMiddleware, requireMinRole } from '../middleware/auth.middleware';

function createInstructorAvailabilityRouter() {
	const router = Router({ mergeParams: true });

	router.get(
		'/weekly',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(getWeekly),
	);

	router.put(
		'/weekly/:dayOfWeek',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(putWeeklyDay),
	);

	router.delete(
		'/weekly/:dayOfWeek',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(deleteWeeklyDayHandler),
	);

	router.get(
		'/exceptions',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(getExceptions),
	);

	router.put(
		'/exceptions/:date',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(putExceptionHandler),
	);

	router.delete(
		'/exceptions/:date',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(deleteExceptionHandler),
	);

	router.get(
		'/compute',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(computeAvailabilityHandler),
	);

	router.get(
		'/slots',
		authMiddleware,
		requireMinRole('MANAGER'),
		asyncHandler(getSlotsHandler),
	);

	return router;
}

export { createInstructorAvailabilityRouter };
