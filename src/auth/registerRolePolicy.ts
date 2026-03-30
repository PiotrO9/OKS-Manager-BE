import { Role } from '@prisma/client';

/**
 * Jedyny skąd zasady: kto może zarejestrować użytkownika o danej roli (endpoint POST /auth/register).
 * Tworzenie ADMIN / MANAGER tym flow jest zawsze zabronione.
 */
function canInvokerRegisterUserWithRole(
	invokerRole: Role,
	targetRole: Role,
): boolean {
	if (targetRole === Role.ADMIN || targetRole === Role.MANAGER) {
		return false;
	}

	if (targetRole === Role.INSTRUCTOR) {
		return invokerRole === Role.ADMIN || invokerRole === Role.MANAGER;
	}

	if (targetRole === Role.STUDENT) {
		return (
			invokerRole === Role.ADMIN ||
			invokerRole === Role.MANAGER ||
			invokerRole === Role.INSTRUCTOR
		);
	}

	return false;
}

export { canInvokerRegisterUserWithRole };
