import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/__tests__/integration/**/*.integration.test.ts'],
		fileParallelism: false,
		setupFiles: ['src/__tests__/integration/setup.ts'],
	},
});
