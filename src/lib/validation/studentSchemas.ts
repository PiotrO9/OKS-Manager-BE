import { z } from 'zod';
import { UUID_PARAM_RE, zodPreprocessQueryFirst } from './uuidCore';

export const studentUserIdParamsSchema = z.object({
	userId: z.string().trim().regex(UUID_PARAM_RE, 'Invalid user id'),
});

export const studentDetailParamsSchema = z.object({
	userId: z.string().trim().regex(UUID_PARAM_RE, 'Invalid user id'),
});

export const studentDetailQuerySchema = z.object({
	schoolId: zodPreprocessQueryFirst(
		z
			.string({ required_error: 'schoolId is required' })
			.min(1, 'schoolId is required')
			.regex(UUID_PARAM_RE, 'Invalid schoolId'),
	),
});

export type StudentDetailQuery = z.infer<typeof studentDetailQuerySchema>;

export const studentProcessStatusQuerySchema = studentDetailQuerySchema;

export type StudentProcessStatusQuery = z.infer<
	typeof studentProcessStatusQuerySchema
>;

export const studentPaymentsQuerySchema = z.object({
	schoolId: zodPreprocessQueryFirst(
		z.preprocess(
			(val) => (val === '' || val === null ? undefined : val),
			z.string().regex(UUID_PARAM_RE, 'Invalid schoolId').optional(),
		),
	).optional(),
});

export type StudentPaymentsQuery = z.infer<typeof studentPaymentsQuerySchema>;

const studentPaymentDateSchema = z.preprocess(
	(val) => {
		if (val === null || val === undefined) {
			return null;
		}
		if (typeof val !== 'string') {
			return val;
		}
		const t = val.trim();
		return t.length > 0 ? t : null;
	},
	z
		.union([
			z.null(),
			z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
		])
		.optional(),
);

const studentPaymentMethodSchema = z.preprocess(
	(val) => {
		if (val === null || val === undefined) {
			return null;
		}
		if (typeof val !== 'string') {
			return val;
		}
		const t = val.trim();
		return t.length > 0 ? t : null;
	},
	z.union([z.null(), z.string().max(80, 'Method is too long')]).optional(),
);

const studentPaymentSchoolIdBodySchema = z.object({
	schoolId: z.string().trim().regex(UUID_PARAM_RE, 'Invalid schoolId'),
});

export const studentPaymentParamsSchema = z.object({
	userId: z.string().trim().regex(UUID_PARAM_RE, 'Invalid user id'),
	paymentId: z.string().trim().regex(UUID_PARAM_RE, 'Invalid payment id'),
});

export const createStudentPaymentBodySchema =
	studentPaymentSchoolIdBodySchema.extend({
		paymentPlanId: z
			.string()
			.trim()
			.regex(UUID_PARAM_RE, 'Invalid paymentPlanId'),
		amount: z.preprocess(
			(val) => (typeof val === 'number' ? String(val) : val),
			z
				.string()
				.trim()
				.regex(/^\d+(\.\d{1,2})?$/, 'Invalid amount')
				.refine((value) => Number(value) > 0, 'Amount must be positive'),
		),
		dueDate: studentPaymentDateSchema,
		method: studentPaymentMethodSchema,
	});

export type CreateStudentPaymentBody = z.infer<
	typeof createStudentPaymentBodySchema
>;

export const updateStudentPaymentBodySchema =
	studentPaymentSchoolIdBodySchema.extend({
		dueDate: studentPaymentDateSchema,
		method: studentPaymentMethodSchema,
	});

export type UpdateStudentPaymentBody = z.infer<
	typeof updateStudentPaymentBodySchema
>;

export const markStudentPaymentPaidBodySchema =
	studentPaymentSchoolIdBodySchema.extend({
		paidAt: studentPaymentDateSchema,
	});

export type MarkStudentPaymentPaidBody = z.infer<
	typeof markStudentPaymentPaidBodySchema
>;

export const markStudentPaymentUnpaidBodySchema =
	studentPaymentSchoolIdBodySchema;

export type MarkStudentPaymentUnpaidBody = z.infer<
	typeof markStudentPaymentUnpaidBodySchema
>;

const STUDENT_EVENTS_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const studentEventsQuerySchema = z
	.object({
		schoolId: zodPreprocessQueryFirst(
			z.preprocess(
				(val) => (val === '' || val === null ? undefined : val),
				z.string().regex(UUID_PARAM_RE, 'Invalid schoolId').optional(),
			),
		).optional(),
		dateFrom: zodPreprocessQueryFirst(
			z
				.string()
				.regex(
					STUDENT_EVENTS_DATE_RE,
					'dateFrom must be in YYYY-MM-DD format',
				)
				.optional(),
		),
		dateTo: zodPreprocessQueryFirst(
			z
				.string()
				.regex(
					STUDENT_EVENTS_DATE_RE,
					'dateTo must be in YYYY-MM-DD format',
				)
				.optional(),
		),
	})
	.superRefine((data, ctx) => {
		const hasFrom = data.dateFrom !== undefined;
		const hasTo = data.dateTo !== undefined;
		if (hasFrom !== hasTo) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					'Both dateFrom and dateTo are required when filtering by date range',
				path: hasFrom ? ['dateTo'] : ['dateFrom'],
			});
			return;
		}
		if (hasFrom && data.dateFrom! > data.dateTo!) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'dateFrom must be on or before dateTo',
				path: ['dateFrom'],
			});
		}
	});

export type StudentEventsQuery = z.infer<typeof studentEventsQuerySchema>;

export const assignStudentDrivingSchoolBodySchema = z.object({
	schoolId: z.string().trim().regex(UUID_PARAM_RE, 'Invalid schoolId'),
});

export const patchStudentBodySchema = z.object({
	notes: z.preprocess(
		(val) => {
			if (val === null || val === undefined) {
				return null;
			}
			if (typeof val !== 'string') {
				return val;
			}
			const t = val.trim();
			return t === '' ? null : t;
		},
		z.union([
			z.null(),
			z.string().max(5000, 'Notes must not exceed 5000 characters'),
		]),
	),
});

export const patchStudentPkkBodySchema = z.object({
	pkkNumber: z.preprocess(
		(val) => {
			if (val === null) {
				return null;
			}
			if (typeof val !== 'string') {
				return val;
			}
			const t = val.trim();
			return t === '' ? null : t;
		},
		z.union([
			z.null(),
			z.string().regex(/^\d{20}$/, 'PKK must be exactly 20 digits'),
		]),
	),
});

export const assignStudentToCourseBodySchema = z.object({
	courseId: z.string().trim().regex(UUID_PARAM_RE, 'Invalid courseId'),
});

export const courseParticipantStatusSchema = z.enum(['ACTIVE', 'FINISHED']);

export const patchCourseParticipantStatusBodySchema = z.object({
	status: courseParticipantStatusSchema,
});

export const studentCourseParamsSchema = z.object({
	userId: z.string().trim().regex(UUID_PARAM_RE, 'Invalid user id'),
	courseId: z.string().trim().regex(UUID_PARAM_RE, 'Invalid course id'),
});

export const listStudentsQuerySchema = z.object({
	schoolId: zodPreprocessQueryFirst(
		z
			.string({ required_error: 'schoolId is required' })
			.min(1, 'schoolId is required')
			.regex(UUID_PARAM_RE, 'Invalid schoolId'),
	),
	courseId: zodPreprocessQueryFirst(
		z.string().trim().regex(UUID_PARAM_RE, 'Invalid courseId').optional(),
	),
	page: zodPreprocessQueryFirst(z.coerce.number().int().min(1).default(1)),
	limit: zodPreprocessQueryFirst(
		z.coerce.number().int().min(1).max(100).default(20),
	),
});

export type ListStudentsQuery = z.infer<typeof listStudentsQuerySchema>;
