import type { CourseKind } from '@prisma/client';
import { z } from 'zod';
import { UUID_PARAM_RE } from '../lib/validation/uuid';

export const offeredCourseTypeIdsFieldSchema = z
	.array(
		z.string().regex(UUID_PARAM_RE, 'Invalid offeredCourseTypeIds entry'),
	)
	.transform((arr) => [...new Set(arr)]);

const COURSE_KIND_VALUES = [
	'THEORY_GROUP',
	'PRACTICAL',
	'EXTRA',
] as const satisfies readonly CourseKind[];

export const enabledCourseKindsFieldSchema = z
	.array(z.enum(COURSE_KIND_VALUES))
	.transform((arr) => [...new Set(arr)] as CourseKind[]);
