/**
 * Re-eksport pod OpenAPI — alias `instructorId` vs `id` w innych routerach.
 */
export {
	computeQuerySchema,
	dayOfWeekParamsSchema,
	exceptionDateParamsSchema,
	exceptionsQuerySchema,
	instructorIdParamsSchema as availabilityInstructorIdParamsSchema,
	putExceptionBodySchema,
	putWeeklyBodySchema,
} from './instructor-availability.schemas';
