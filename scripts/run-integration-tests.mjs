import { spawnSync } from 'node:child_process';

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();

if (!testDatabaseUrl) {
	console.error('TEST_DATABASE_URL is required for integration tests.');
	process.exit(1);
}

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const env = {
	...process.env,
	NODE_ENV: 'test',
	DATABASE_URL: testDatabaseUrl,
};

for (const args of [
	['prisma', 'migrate', 'deploy'],
	['vitest', 'run', '--config', 'vitest.integration.config.ts'],
]) {
	const result = spawnSync(command, args, {
		env,
		stdio: 'inherit',
		shell: process.platform === 'win32',
	});

	if (result.error) {
		console.error(result.error);
		process.exit(1);
	}

	if (result.status !== 0) {
		process.exit(result.status ?? 1);
	}
}
