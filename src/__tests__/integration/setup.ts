const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();

if (!testDatabaseUrl) {
	throw new Error(
		'TEST_DATABASE_URL is required for database integration tests',
	);
}

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testDatabaseUrl;
