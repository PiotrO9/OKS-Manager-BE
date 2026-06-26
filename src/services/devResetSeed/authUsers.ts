import { Role } from '@prisma/client';
import { getSupabaseAdminClient } from '../../lib/supabaseAdmin';
import {
	ADMIN_ACCOUNT,
	DEMO_ACCOUNTS,
	DEMO_PASSWORD,
	FIRST_NAMES,
	LAST_NAMES,
} from './constants';
import { pick } from './dateHelpers';
import type { SeedUserInput } from './types';

async function listExistingAuthUserIdsByEmail(
	emails: readonly string[],
): Promise<Map<string, string>> {
	const normalizedEmails = new Set(emails.map((email) => email.toLowerCase()));
	const result = new Map<string, string>();
	if (normalizedEmails.size === 0) {
		return result;
	}

	const supabase = getSupabaseAdminClient();
	const perPage = 1000;
	for (let page = 1; page <= 10; page += 1) {
		const { data, error } = await supabase.auth.admin.listUsers({
			page,
			perPage,
		});
		if (error) {
			throw error;
		}
		for (const user of data.users) {
			const email = user.email?.toLowerCase();
			if (email && normalizedEmails.has(email)) {
				result.set(email, user.id);
			}
		}
		if (result.size === normalizedEmails.size) {
			return result;
		}
		if (data.users.length < perPage) {
			return result;
		}
	}
	return result;
}

export async function ensureAuthUsers(
	inputs: readonly SeedUserInput[],
): Promise<Map<string, string>> {
	const supabase = getSupabaseAdminClient();
	const existingByEmail = await listExistingAuthUserIdsByEmail(
		inputs.map((input) => input.email),
	);
	const idsByEmail = new Map<string, string>();

	for (const input of inputs) {
		const normalizedEmail = input.email.toLowerCase();
		const existingId = existingByEmail.get(normalizedEmail);
		if (existingId) {
			const { error } = await supabase.auth.admin.updateUserById(existingId, {
				password: input.password,
				email_confirm: true,
				user_metadata: {
					firstName: input.firstName,
					lastName: input.lastName,
					role: input.role,
				},
			});
			if (error) {
				throw error;
			}
			idsByEmail.set(normalizedEmail, existingId);
			continue;
		}

		const { data, error } = await supabase.auth.admin.createUser({
			email: input.email,
			password: input.password,
			email_confirm: true,
			user_metadata: {
				firstName: input.firstName,
				lastName: input.lastName,
				role: input.role,
			},
		});
		if (error) {
			throw error;
		}
		if (!data.user?.id) {
			throw new Error(`Supabase did not return id for ${input.email}`);
		}
		idsByEmail.set(normalizedEmail, data.user.id);
	}

	return idsByEmail;
}

export function buildSeedUsers(): SeedUserInput[] {
	const users: SeedUserInput[] = [ADMIN_ACCOUNT, ...DEMO_ACCOUNTS];

	for (let i = 1; i <= 3; i += 1) {
		users.push({
			email: `manager${String(i).padStart(2, '0')}@demo.osk.local`,
			password: DEMO_PASSWORD,
			firstName: pick(FIRST_NAMES, i),
			lastName: pick(LAST_NAMES, i + 1),
			role: Role.MANAGER,
		});
	}

	for (let i = 1; i <= 12; i += 1) {
		users.push({
			email: `instructor${String(i).padStart(2, '0')}@demo.osk.local`,
			password: DEMO_PASSWORD,
			firstName: pick(FIRST_NAMES, i + 3),
			lastName: pick(LAST_NAMES, i + 5),
			role: Role.INSTRUCTOR,
		});
	}

	for (let i = 1; i <= 80; i += 1) {
		users.push({
			email: `student${String(i).padStart(3, '0')}@demo.osk.local`,
			password: DEMO_PASSWORD,
			firstName: pick(FIRST_NAMES, i + 7),
			lastName: pick(LAST_NAMES, i + 11),
			role: Role.STUDENT,
		});
	}

	return users;
}
