import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
	if (process.env.NODE_ENV !== 'test') {
		// eslint-disable-next-line no-console
		console.warn(
			'Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set',
		);
	}
}

export const supabaseServerClient = createClient(
	supabaseUrl || '',
	supabaseServiceRoleKey || '',
);
