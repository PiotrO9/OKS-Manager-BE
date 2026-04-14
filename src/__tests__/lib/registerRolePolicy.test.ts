import { Role } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { canInvokerRegisterUserWithRole } from '../../lib/registerRolePolicy';

describe('canInvokerRegisterUserWithRole — allowed combinations', () => {
	it.each([
		[Role.ADMIN, Role.INSTRUCTOR],
		[Role.ADMIN, Role.STUDENT],
		[Role.MANAGER, Role.INSTRUCTOR],
		[Role.MANAGER, Role.STUDENT],
		[Role.INSTRUCTOR, Role.STUDENT],
	] as const)(
		'returns true for invoker %s → target %s',
		(invoker, target) => {
			expect(canInvokerRegisterUserWithRole(invoker, target)).toBe(true);
		},
	);
});

describe('canInvokerRegisterUserWithRole — forbidden combinations', () => {
	it.each([
		[Role.ADMIN, Role.ADMIN],
		[Role.ADMIN, Role.MANAGER],
		[Role.MANAGER, Role.ADMIN],
		[Role.MANAGER, Role.MANAGER],
		[Role.INSTRUCTOR, Role.ADMIN],
		[Role.INSTRUCTOR, Role.MANAGER],
		[Role.INSTRUCTOR, Role.INSTRUCTOR],
		[Role.STUDENT, Role.ADMIN],
		[Role.STUDENT, Role.MANAGER],
		[Role.STUDENT, Role.INSTRUCTOR],
		[Role.STUDENT, Role.STUDENT],
	] as const)(
		'returns false for invoker %s → target %s',
		(invoker, target) => {
			expect(canInvokerRegisterUserWithRole(invoker, target)).toBe(false);
		},
	);
});
