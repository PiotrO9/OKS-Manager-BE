import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

export { z };
import { instructorAdminPatchBodySchema } from '../../lib/validation/instructorAdminPatch';
import {
	assignInstructorToSchoolBodySchema,
	assignStudentDrivingSchoolBodySchema,
	assignStudentToCourseBodySchema,
	courseIdParamsSchema,
	eventIdAndStudentUserParamsSchema,
	eventIdParamsSchema,
	lessonIdParamsSchema,
	drivingSchoolIdParamsSchema,
	instructorIdParamsSchema,
	listStudentsQuerySchema,
	patchCourseParticipantStatusBodySchema,
	patchStudentBodySchema,
	patchStudentPkkBodySchema,
	schoolIdQuerySchema,
	studentCourseParamsSchema,
	studentDetailParamsSchema,
	studentDetailQuerySchema,
	studentEventsQuerySchema,
	studentPaymentsQuerySchema,
	studentProcessStatusQuerySchema,
	studentUserIdParamsSchema,
	uuidSchema,
} from '../../lib/validation/uuid';
import {
	createCourseBodySchema,
	patchCourseBodySchema,
} from '../../schemas/course.schemas';
import {
	assignStudentsBodySchema,
	createInstructorEventBodySchema,
	eligibleStudentsQuerySchema,
	getEventQuerySchema,
	patchInstructorEventBodySchema,
	replaceEventStudentsBodySchema,
} from '../../schemas/event.schemas';
import {
	bookLessonBodySchema,
	bookOwnLessonBodySchema,
	cancelLessonBodySchema,
	createLessonRatingBodySchema,
	lessonRatingParamsSchema,
} from '../../schemas/lesson.schemas';
import {
	instructorLessonRatingsQuerySchema,
	listLessonRatingsQuerySchema,
} from '../../schemas/lesson-rating.schemas';
import {
	createDrivingSchoolBodySchema,
	setDefaultVehicleBodySchema,
	updateDrivingSchoolBodySchema,
} from '../../schemas/driving-school.schemas';
import { schoolAvailabilitySlotsQuerySchema } from '../../schemas/school-availability.schemas';
import {
	availabilityInstructorIdParamsSchema,
	computeQuerySchema,
	dayOfWeekParamsSchema,
	exceptionDateParamsSchema,
	exceptionsQuerySchema,
	putExceptionBodySchema,
	putWeeklyBodySchema,
	slotsQuerySchema,
} from '../../schemas/instructor-availability.openapi';
import {
	vehicleAvailabilityStatusSchema,
	vehicleIdParamsSchema,
	vehicleListQuerySchema,
} from '../../schemas/vehicle.schemas';

export const loginBodySchema = z.object({
	email: z.string().email(),
	password: z.string().min(1),
});

export const registerBodySchema = z
	.object({
		email: z.string().email(),
		password: z.string().min(1),
		role: z.enum(['STUDENT', 'INSTRUCTOR']),
		firstName: z.string().min(1),
		lastName: z.string().min(1),
		phone: z.string().optional().nullable(),
		licenseNumber: z.string().optional().nullable(),
		schoolId: uuidSchema.optional().nullable(),
	})
	.describe('Szczegóły: context/auth.md — zależności pól od roli');

export const authMeUserSchema = z.object({
	id: uuidSchema,
	name: z.string(),
	firstName: z.string(),
	lastName: z.string(),
	email: z.string().email(),
	phone: z.string().nullable(),
	avatarUrl: z.string().nullable(),
	bio: z.string().nullable(),
	profileUpdatedAt: z.date().nullable(),
	role: z.string(),
	drivingSchools: z
		.array(
			z.object({
				id: uuidSchema,
				name: z.string(),
				city: z.string().nullable(),
				address: z.string().nullable(),
			}),
		)
		.optional(),
	defaultOskId: uuidSchema.nullable().optional(),
	pkkNumber: z
		.string()
		.nullable()
		.optional()
		.describe('Available for STUDENT; PKK number or null.'),
});

export const accessTokenDataSchema = z.object({
	access_token: z.string().min(1),
});

export const authLoginDataSchema = accessTokenDataSchema.extend({
	user: z.unknown(),
});

export const instructorEventDtoSchema = z
	.object({
		id: uuidSchema,
		instructorId: uuidSchema,
		type: z.string(),
		startTime: z.string().datetime(),
		endTime: z.string().datetime(),
		vehicleId: uuidSchema.nullable(),
		capacity: z.number().int().nullable().optional(),
		courseId: uuidSchema.nullable().optional(),
		status: z.string().optional(),
		createdAt: z.string().datetime(),
	})
	.passthrough();

export const lessonDtoSchema = z
	.object({
		id: uuidSchema,
		courseId: uuidSchema,
		studentId: uuidSchema.optional(),
		instructorId: uuidSchema.optional(),
		vehicleId: uuidSchema.nullable().optional(),
		lessonType: z.string().optional(),
		startTime: z.string().datetime(),
		endTime: z.string().datetime(),
		status: z.string(),
		createdAt: z.string().datetime().optional(),
	})
	.passthrough();

export const lessonRatingDtoSchema = z
	.object({
		id: uuidSchema,
		lessonId: uuidSchema,
		instructorId: uuidSchema,
		rating: z.number(),
		comment: z.string().nullable(),
		createdAt: z.string().datetime(),
	})
	.passthrough();

export const vehicleDataSchema = z.record(z.unknown());

export function okDataUnknown(description: string) {
	return {
		description,
		content: {
			'application/json': {
				schema: z.object({
					success: z.literal(true),
					data: z.unknown().optional(),
				}),
			},
		},
	};
}

export function okDataSchema(description: string, dataSchema: z.ZodTypeAny) {
	return {
		description,
		content: {
			'application/json': {
				schema: z.object({
					success: z.literal(true),
					data: dataSchema,
				}),
			},
		},
	};
}

export function clientError(description?: string) {
	return {
		description: description ?? 'Błąd walidacji lub reguł biznesowych',
		content: {
			'application/json': {
				schema: z.object({
					success: z.literal(false),
					error: z.string(),
				}),
			},
		},
	};
}

export function stdBearerResponses(
	extra?: Record<string, RouteConfig['responses'][string]>,
) {
	return {
		...extra,
		400: clientError(),
		401: clientError('Brak lub nieprawidłowy Bearer token'),
		403: clientError('Brak wymaganej roli lub dostępu'),
		404: clientError('Zasób nie istnieje'),
	};
}

export {
	instructorAdminPatchBodySchema,
	assignInstructorToSchoolBodySchema,
	assignStudentDrivingSchoolBodySchema,
	assignStudentToCourseBodySchema,
	courseIdParamsSchema,
	eventIdAndStudentUserParamsSchema,
	eventIdParamsSchema,
	lessonIdParamsSchema,
	drivingSchoolIdParamsSchema,
	instructorIdParamsSchema,
	listStudentsQuerySchema,
	patchCourseParticipantStatusBodySchema,
	patchStudentBodySchema,
	patchStudentPkkBodySchema,
	schoolIdQuerySchema,
	studentCourseParamsSchema,
	studentDetailParamsSchema,
	studentDetailQuerySchema,
	studentEventsQuerySchema,
	studentPaymentsQuerySchema,
	studentProcessStatusQuerySchema,
	studentUserIdParamsSchema,
	uuidSchema,
	createCourseBodySchema,
	patchCourseBodySchema,
	assignStudentsBodySchema,
	createInstructorEventBodySchema,
	eligibleStudentsQuerySchema,
	getEventQuerySchema,
	patchInstructorEventBodySchema,
	replaceEventStudentsBodySchema,
	bookLessonBodySchema,
	bookOwnLessonBodySchema,
	cancelLessonBodySchema,
	createLessonRatingBodySchema,
	lessonRatingParamsSchema,
	instructorLessonRatingsQuerySchema,
	listLessonRatingsQuerySchema,
	createDrivingSchoolBodySchema,
	setDefaultVehicleBodySchema,
	updateDrivingSchoolBodySchema,
	schoolAvailabilitySlotsQuerySchema,
	availabilityInstructorIdParamsSchema,
	computeQuerySchema,
	dayOfWeekParamsSchema,
	exceptionDateParamsSchema,
	exceptionsQuerySchema,
	putExceptionBodySchema,
	putWeeklyBodySchema,
	slotsQuerySchema,
	vehicleAvailabilityStatusSchema,
	vehicleIdParamsSchema,
	vehicleListQuerySchema,
};
