import { z } from 'zod';

const textValue = z.string().trim().min(1).max(160);
const filterField = z.enum([
	'occurredAt',
	'type',
	'category',
	'severity',
	'outcome',
	'operationCode',
	'actorRole',
	'actorVisibility',
	'reasonCode',
	'httpStatus',
	'actorUserId',
	'targetUserId',
	'clientIp',
]);
const filterRule = z
	.object({
		field: filterField,
		operator: z.enum([
			'is',
			'isNot',
			'oneOf',
			'isEmpty',
			'on',
			'before',
			'after',
			'between',
		]),
		value: z
			.union([
				textValue,
				z.array(textValue).min(1).max(20),
				z.object({ from: textValue, to: textValue }).strict(),
			])
			.optional(),
	})
	.strict();

export const securityLogFiltersSchema = z
	.object({ rules: z.array(filterRule).max(12) })
	.strict();
export type SecurityLogFilters = z.infer<typeof securityLogFiltersSchema>;

export const securityLogListQuerySchema = z
	.object({
		schoolId: z.string().uuid(),
		limit: z.coerce.number().int().min(1).max(100).default(20),
		cursor: z.string().max(2048).optional(),
		search: z.string().trim().max(120).default(''),
		view: z
			.enum([
				'all',
				'failed-logins',
				'suspicious',
				'access-denied',
				'account-changes',
			])
			.default('all'),
		filters: z
			.string()
			.max(4096)
			.optional()
			.transform((value, ctx) => {
				if (!value) return { rules: [] } as SecurityLogFilters;
				try {
					const parsed = securityLogFiltersSchema.safeParse(
						JSON.parse(value),
					);
					if (parsed.success) return parsed.data;
				} catch {
					/* invalid JSON */
				}
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Nieprawidłowe filtry',
				});
				return z.NEVER;
			}),
	})
	.strict();

export const securityLogDetailQuerySchema = z
	.object({ schoolId: z.string().uuid() })
	.strict();
export const securityLogDetailParamsSchema = z
	.object({ eventId: z.string().uuid() })
	.strict();
export const securityLogOptionsQuerySchema = z
	.object({
		schoolId: z.string().uuid(),
		kind: z.enum(['actor', 'target']).default('actor'),
		search: z.string().trim().max(120).default(''),
		limit: z.coerce.number().int().min(1).max(50).default(20),
		cursor: z.string().max(256).optional(),
	})
	.strict();
