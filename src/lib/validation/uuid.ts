import { z } from 'zod';

/** Jak wcześniej w vehicles/driving-schools — wariant UUID v1–v8 (Prisma / PostgreSQL). */
export const UUID_PARAM_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const uuidSchema = z.string().regex(UUID_PARAM_RE, 'Invalid id');

function firstQueryValue(val: unknown): unknown {
	if (Array.isArray(val)) {
		if (val.length === 0) {
			return undefined;
		}
		return val[0];
	}
	return val;
}

/** Body/query — brak / pusty → null, zły typ lub format → invalid. */
export function parseUuidParam(raw: unknown): string | null | 'invalid' {
	if (raw === undefined || raw === null) {
		return null;
	}
	if (Array.isArray(raw)) {
		if (raw.length === 0) {
			return null;
		}
		return parseUuidParam(raw[0]);
	}
	if (typeof raw !== 'string') {
		return 'invalid';
	}
	const id = raw.trim();
	if (id === '') {
		return null;
	}
	return UUID_PARAM_RE.test(id) ? id : 'invalid';
}

/** `:id` ze ścieżki — trim + UUID. */
export function parseUuidPathParam(
	raw: string | string[] | undefined,
): string | null {
	if (raw === undefined) {
		return null;
	}
	const single = Array.isArray(raw) ? raw[0] : raw;
	if (typeof single !== 'string') {
		return null;
	}
	const id = single.trim();
	return UUID_PARAM_RE.test(id) ? id : null;
}

/** Zod preprocess dla query (Express czasem zwraca tablicę dla powtórzonych kluczy). */
export function zodPreprocessQueryFirst<T extends z.ZodTypeAny>(schema: T) {
	return z.preprocess(firstQueryValue, schema);
}

export const schoolIdQuerySchema = z.object({
	schoolId: zodPreprocessQueryFirst(
		z
			.string({ required_error: 'schoolId is required' })
			.min(1, 'schoolId is required')
			.regex(UUID_PARAM_RE, 'Invalid schoolId'),
	),
});

export const vehicleIdParamsSchema = z.object({
	id: z.string().trim().regex(UUID_PARAM_RE, 'Invalid vehicle id'),
});

export const instructorIdParamsSchema = z.object({
	id: z.string().trim().regex(UUID_PARAM_RE, 'Invalid instructor id'),
});

export const assignInstructorToSchoolBodySchema = z.object({
	schoolId: z.string().trim().regex(UUID_PARAM_RE, 'Invalid schoolId'),
});

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

export const drivingSchoolIdParamsSchema = z.object({
	id: z.string().trim().regex(UUID_PARAM_RE, 'Invalid driving school id'),
});

export const courseIdParamsSchema = z.object({
	id: z.string().trim().regex(UUID_PARAM_RE, 'Invalid course id'),
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
